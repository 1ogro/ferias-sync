import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function todayInSaoPaulo(): { iso: string; day: number; month: number; year: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const year = get("year"), month = get("month"), day = get("day");
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { iso, day, month, year };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    const dryRun = body?.dry_run === true;
    const overrideDate: string | undefined = body?.date;

    const { iso: todayIso, day: todayDay, month: todayMonth, year: currentYear } = overrideDate
      ? (() => {
          const [y, m, d] = overrideDate.split("-").map(Number);
          return { iso: overrideDate, day: d, month: m, year: y };
        })()
      : todayInSaoPaulo();

    console.log(`Anniversary accrual run for ${todayIso} (dry_run=${dryRun})`);

    // 1. Pessoas ativas com data_contrato cujo (mês, dia) == hoje
    const { data: people, error: peopleErr } = await supabase
      .from("people")
      .select("id, nome, data_contrato")
      .eq("ativo", true)
      .not("data_contrato", "is", null);
    if (peopleErr) throw peopleErr;

    const anniversaries = (people || []).filter((p: any) => {
      const [y, m, d] = p.data_contrato.split("-").map(Number);
      return m === todayMonth && d === todayDay && y < currentYear;
    });

    const results: any[] = [];
    let created = 0, updated = 0, skipped = 0, errors = 0;

    for (const p of anniversaries) {
      try {
        const [hireYear] = p.data_contrato.split("-").map(Number);
        const yearsCompleted = currentYear - hireYear;
        if (yearsCompleted <= 0) {
          results.push({ person_id: p.id, nome: p.nome, action: "skipped_no_years" });
          skipped++;
          continue;
        }

        const auditEntityId = `${p.id}:${currentYear}`;

        // Idempotência
        const { data: existingLog } = await supabase
          .from("audit_logs")
          .select("id")
          .eq("entidade", "vacation_balances")
          .eq("acao", "ANNIVERSARY_ACCRUAL")
          .eq("entidade_id", auditEntityId)
          .maybeSingle();

        if (existingLog) {
          results.push({ person_id: p.id, nome: p.nome, action: "skipped_already_processed" });
          skipped++;
          continue;
        }

        // Recalcular used_days a partir das requests
        const { data: reqs } = await supabase
          .from("requests")
          .select("inicio, fim, status, dias_abono")
          .eq("requester_id", p.id)
          .eq("tipo", "FERIAS");

        const todayDate = todayIso;
        const usedDays = (reqs || []).reduce((sum: number, r: any) => {
          if (!r.inicio || !r.fim) return sum;
          const realized = r.status === "REALIZADO" ||
            (r.status === "APROVADO_FINAL" && r.fim < todayDate);
          if (!realized) return sum;
          const start = new Date(r.inicio);
          const end = new Date(r.fim);
          const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
          return sum + days + (r.dias_abono || 0);
        }, 0);

        const anniversaryDate = `${currentYear}-${String(todayMonth).padStart(2, "0")}-${String(todayDay).padStart(2, "0")}`;

        // Buscar registro atual
        const { data: existing } = await supabase
          .from("vacation_balances")
          .select("id, accrued_days, manual_justification")
          .eq("person_id", p.id)
          .eq("year", currentYear)
          .maybeSingle();

        const accrualLine = `[${todayIso}] +30 dias por aniversário de contrato (${yearsCompleted}º ano)`;
        let action: string;
        let newAccrued: number;

        if (!dryRun) {
          if (existing) {
            newAccrued = (existing.accrued_days || 0) + 30;
            const newJustification = existing.manual_justification
              ? `${existing.manual_justification}\n${accrualLine}`
              : accrualLine;
            const { error: updErr } = await supabase
              .from("vacation_balances")
              .update({
                accrued_days: newAccrued,
                used_days: usedDays,
                balance_days: Math.max(0, newAccrued - usedDays),
                manual_justification: newJustification,
                updated_by: "system",
              })
              .eq("id", existing.id);
            if (updErr) throw updErr;
            action = "updated";
            updated++;
          } else {
            newAccrued = yearsCompleted * 30;
            const { error: insErr } = await supabase
              .from("vacation_balances")
              .insert({
                person_id: p.id,
                year: currentYear,
                accrued_days: newAccrued,
                used_days: usedDays,
                balance_days: Math.max(0, newAccrued - usedDays),
                contract_anniversary: anniversaryDate,
                manual_justification: accrualLine,
                updated_by: "system",
              });
            if (insErr) throw insErr;
            action = "created";
            created++;
          }

          await supabase.from("audit_logs").insert({
            entidade: "vacation_balances",
            entidade_id: auditEntityId,
            acao: "ANNIVERSARY_ACCRUAL",
            actor_id: null,
            payload: {
              person_id: p.id,
              nome: p.nome,
              year: currentYear,
              years_completed: yearsCompleted,
              accrued_after: newAccrued,
              used_days: usedDays,
              action,
              trigger_date: todayIso,
            },
          });
        } else {
          newAccrued = existing ? (existing.accrued_days || 0) + 30 : yearsCompleted * 30;
          action = existing ? "would_update" : "would_create";
        }

        results.push({
          person_id: p.id,
          nome: p.nome,
          action,
          years_completed: yearsCompleted,
          accrued_after: newAccrued,
          used_days: usedDays,
        });
      } catch (e: any) {
        console.error(`Error processing ${p.id}:`, e?.message);
        errors++;
        results.push({ person_id: p.id, nome: p.nome, action: "error", error: e?.message });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      trigger_date: todayIso,
      dry_run: dryRun,
      summary: { total_anniversaries: anniversaries.length, created, updated, skipped, errors },
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Fatal error:", error);
    return new Response(JSON.stringify({ success: false, error: error?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
