// send-stale-request-reminders — daily job that chases requests parked in
// INFORMACOES_ADICIONAIS. After 3 days the requester is reminded (email + Slack);
// after 15 days the approver who asked for information is warned too.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyRecipient } from "../_shared/notify-helpers.ts";
import { todayInSP } from "../_shared/date.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://ferias-sync.lovable.app";
const REMINDER_AFTER_DAYS = 3;
const ESCALATE_AFTER_DAYS = 15;

const TIPO_LABEL: Record<string, string> = {
  FERIAS: "Férias",
  DAYOFF: "Day-off",
  DAY_OFF: "Day-off",
  LICENCA_MEDICA: "Licença médica",
  LICENCA_MATERNIDADE: "Licença maternidade",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: requests, error } = await admin
      .from("requests")
      .select(`
        id, tipo, inicio, fim, status, updated_at,
        requester:people!requester_id(id, nome, email, email_pessoal, ativo)
      `)
      .eq("status", "INFORMACOES_ADICIONAIS");

    if (error) throw error;

    const today = todayInSP().iso;
    const results: any[] = [];

    for (const r of requests || []) {
      const requester: any = (r as any).requester;
      if (!requester?.ativo) continue;

      const stale = daysSince(r.updated_at);
      if (stale < REMINDER_AFTER_DAYS) continue;

      // Idempotency: at most one reminder per request per day
      const logKey = `stale:${today}:${r.id}`;
      const { data: already } = await admin
        .from("audit_logs")
        .select("id")
        .eq("entidade", "requests")
        .eq("entidade_id", logKey)
        .maybeSingle();
      if (already) {
        results.push({ request_id: r.id, skipped: "already_sent_today" });
        continue;
      }

      const tipo = TIPO_LABEL[r.tipo] || r.tipo;
      const periodo = r.fim && r.fim !== r.inicio
        ? `${fmtDate(r.inicio)} a ${fmtDate(r.fim)}`
        : fmtDate(r.inicio);
      const link = `${APP_URL}/requests/${r.id}`;

      const email = requester.email || requester.email_pessoal;
      if (email) {
        await notifyRecipient(admin, { person_id: requester.id, email, nome: requester.nome }, {
          slackText:
            `:hourglass_flowing_sand: Sua solicitação de *${tipo}* (${periodo}) está parada há ${stale} dias ` +
            `aguardando informações adicionais.\nResponda ou cancele: ${link}`,
          emailSubject: `Sua solicitação de ${tipo} está aguardando sua resposta`,
          emailHtml: `
            <h2>Olá, ${requester.nome}!</h2>
            <p>Sua solicitação de <strong>${tipo}</strong> (${periodo}) está parada há
            <strong>${stale} dias</strong> aguardando informações adicionais.</p>
            <p>Responda ao aprovador ou cancele o pedido para não deixá-lo em aberto.</p>
            <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#0066cc;color:#fff;text-decoration:none;border-radius:5px;">Ver solicitação</a></p>
          `,
        });
      }

      // Escalate to the approver who asked for information
      let escalated = false;
      if (stale >= ESCALATE_AFTER_DAYS) {
        const { data: lastInfo } = await admin
          .from("approvals")
          .select("approver_id, created_at")
          .eq("request_id", r.id)
          .eq("acao", "PEDIR_INFO")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastInfo?.approver_id) {
          const { data: approver } = await admin
            .from("people")
            .select("id, nome, email, email_pessoal, ativo")
            .eq("id", lastInfo.approver_id)
            .maybeSingle();

          const approverEmail = approver?.email || approver?.email_pessoal;
          if (approver?.ativo && approverEmail) {
            await notifyRecipient(
              admin,
              { person_id: approver.id, email: approverEmail, nome: approver.nome },
              {
                slackText:
                  `:warning: A solicitação de *${tipo}* de ${requester.nome} (${periodo}) está sem resposta ` +
                  `há ${stale} dias desde o seu pedido de informações.\nAvalie cancelar ou decidir: ${link}`,
                emailSubject: `Solicitação abandonada: ${requester.nome} (${tipo})`,
                emailHtml: `
                  <h2>Olá, ${approver.nome}!</h2>
                  <p>A solicitação de <strong>${tipo}</strong> de <strong>${requester.nome}</strong> (${periodo})
                  está sem resposta há <strong>${stale} dias</strong> desde o seu pedido de informações adicionais.</p>
                  <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#0066cc;color:#fff;text-decoration:none;border-radius:5px;">Ver solicitação</a></p>
                `,
              },
            );
            escalated = true;
          }
        }
      }

      await admin.from("audit_logs").insert({
        entidade: "requests",
        entidade_id: logKey,
        acao: "STALE_REQUEST_REMINDER",
        actor_id: requester.id,
        payload: { request_id: r.id, stale_days: stale, escalated },
      });

      results.push({ request_id: r.id, stale_days: stale, escalated });
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-stale-request-reminders error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
