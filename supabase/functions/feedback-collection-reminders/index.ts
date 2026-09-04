// feedback-collection-reminders — cobrança periódica de coleta de feedback por gestor.
// Roda 1x/dia; decide internamente se é dia de cobrança (início do ciclo) ou de repique.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPrefs, lookupSlackUserByEmail, sendSlackDM, sendEmail } from "../_shared/notify-helpers.ts";
import { nowInSP, parseOverrideDate, addDaysISO } from "../_shared/date.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = (Deno.env.get("PUBLIC_APP_URL") || "https://ferias-sync.lovable.app").replace(/\/$/, "");
const FEEDBACK_URL = `${APP_URL}/engagement`;

interface PendingRow {
  manager_id: string;
  manager_name: string;
  manager_email: string | null;
  person_id: string;
  person_name: string;
  last_feedback_at: string | null;
  bucket: "never" | "overdue";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Início do ciclo corrente: dias 1 e 16 quando a cadência é 15; senão janelas fixas a partir do dia 1. */
function cycleStartFor(iso: string, cycleDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const idx = Math.floor((d - 1) / Math.max(cycleDays, 1)) * Math.max(cycleDays, 1) + 1;
  return `${y}-${String(m).padStart(2, "0")}-${String(idx).padStart(2, "0")}`;
}

function daysSince(iso: string | null, todayIso: string): number {
  if (!iso) return 9999;
  const a = new Date(`${todayIso}T00:00:00-03:00`).getTime();
  const b = new Date(iso).getTime();
  return Math.floor((a - b) / 86_400_000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* sem corpo */ }
    const force = body?.force === true; // teste manual: ignora janela de horário
    const dryRun = body?.dry_run === true;
    const today = parseOverrideDate(body?.date) ?? nowInSP();

    const { data: settings } = await admin
      .from("feedback_reminder_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!settings || settings.enabled === false) {
      return json({ skipped: "disabled" });
    }

    const cycleDays = settings.cycle_days ?? 15;
    const overdueDays = settings.overdue_days ?? 45;
    const nudgeAfter = settings.nudge_after_days ?? 3;
    const maxNudges = settings.max_nudges ?? 2;
    const sendHour = settings.send_hour ?? 9;

    if (!force && today.hour !== undefined && today.hour < sendHour) {
      return json({ skipped: "before_send_hour", hour: today.hour, sendHour });
    }

    const { data: pending, error: pendErr } = await admin
      .rpc("get_feedback_collection_pending", { p_overdue_days: overdueDays });
    if (pendErr) throw pendErr;

    const rows = (pending || []) as PendingRow[];
    const byManager = new Map<string, PendingRow[]>();
    for (const r of rows) {
      if (!byManager.has(r.manager_id)) byManager.set(r.manager_id, []);
      byManager.get(r.manager_id)!.push(r);
    }

    const cycleStart = cycleStartFor(today.iso, cycleDays);
    const cycleEnd = addDaysISO(cycleStart, cycleDays);

    const { data: cycles } = await admin
      .from("feedback_reminder_cycles")
      .select("*")
      .eq("cycle_start", cycleStart);
    const cycleByManager = new Map<string, any>((cycles || []).map((c: any) => [c.manager_id, c]));

    // Resolve ciclos de gestores que zeraram as pendências
    for (const c of cycles || []) {
      if (!c.resolved_at && !byManager.has(c.manager_id)) {
        if (!dryRun) {
          await admin.from("feedback_reminder_cycles")
            .update({ resolved_at: new Date().toISOString() })
            .eq("id", c.id);
        }
      }
    }

    const sent: string[] = [];
    const escalated: string[] = [];

    for (const [managerId, items] of byManager) {
      const cycle = cycleByManager.get(managerId);
      const isFirst = !cycle;
      const nudgesSent = cycle?.nudges_sent ?? 0;
      const sinceLast = daysSince(cycle?.last_sent_at ?? null, today.iso);

      let action: "initial" | "nudge" | "escalate" | null = null;
      if (isFirst) {
        action = "initial";
      } else if (!cycle.resolved_at && sinceLast >= nudgeAfter) {
        action = nudgesSent >= maxNudges ? (cycle.escalated_at ? null : "escalate") : "nudge";
      }
      if (force && !action) action = "nudge";
      if (!action) continue;

      const never = items.filter((i) => i.bucket === "never");
      const overdue = items.filter((i) => i.bucket === "overdue");
      const manager = items[0];

      const lines: string[] = [];
      if (never.length) {
        lines.push(`*Nunca avaliados (${never.length})*`);
        lines.push(...never.map((i) => `• ${i.person_name}`));
      }
      if (overdue.length) {
        if (lines.length) lines.push("");
        lines.push(`*Sem feedback há mais de ${overdueDays} dias (${overdue.length})*`);
        lines.push(...overdue.map((i) => `• ${i.person_name} — último em ${fmtDate(i.last_feedback_at)}`));
      }

      const prefix = action === "initial"
        ? `📝 Olá, ${manager.manager_name}! Chegou a hora de registrar os feedbacks do seu time (ciclo de ${cycleStart} a ${cycleEnd}).`
        : action === "nudge"
        ? `🔔 Lembrete: ainda há feedbacks pendentes do seu time neste ciclo.`
        : `⚠️ Última chamada: os feedbacks abaixo seguem sem registro neste ciclo.`;

      const slackText = `${prefix}\n\n${lines.join("\n")}\n\n👉 Registrar: ${FEEDBACK_URL}`;
      const emailHtml = `
        <h2>${prefix.replace(/[📝🔔⚠️]/g, "").trim()}</h2>
        ${never.length ? `<h3>Nunca avaliados (${never.length})</h3><ul>${never.map((i) => `<li>${i.person_name}</li>`).join("")}</ul>` : ""}
        ${overdue.length ? `<h3>Sem feedback há mais de ${overdueDays} dias (${overdue.length})</h3><ul>${overdue.map((i) => `<li>${i.person_name} — último em ${fmtDate(i.last_feedback_at)}</li>`).join("")}</ul>` : ""}
        <p><a href="${FEEDBACK_URL}">Registrar feedback</a></p>`;

      if (!dryRun) {
        const prefs = await admin
          .from("notification_preferences")
          .select("feedback_reminders_slack, feedback_reminders_email")
          .eq("person_id", managerId)
          .maybeSingle();
        const wantSlack = prefs.data?.feedback_reminders_slack ?? true;
        const wantEmail = prefs.data?.feedback_reminders_email ?? true;

        if (wantSlack && manager.manager_email) {
          const slackId = await lookupSlackUserByEmail(manager.manager_email);
          if (slackId) await sendSlackDM(slackId, slackText);
        }
        if (wantEmail && manager.manager_email) {
          await sendEmail(manager.manager_email, "Feedbacks pendentes do seu time", emailHtml);
        }

        const payload: any = {
          cycle_start: cycleStart,
          manager_id: managerId,
          pending_never: never.length,
          pending_overdue: overdue.length,
          last_sent_at: new Date().toISOString(),
          nudges_sent: action === "initial" ? 0 : nudgesSent + (action === "nudge" ? 1 : 0),
          resolved_at: null,
        };
        if (action === "escalate") payload.escalated_at = new Date().toISOString();

        await admin.from("feedback_reminder_cycles")
          .upsert(payload, { onConflict: "cycle_start,manager_id" });
      }

      sent.push(managerId);

      // Escalonamento: avisa gerente/diretor responsável
      if (action === "escalate") {
        escalated.push(managerId);
        if (!dryRun) {
          const { data: mgrRow } = await admin
            .from("people")
            .select("gestor_id, sub_time")
            .eq("id", managerId)
            .maybeSingle();

          const targets: any[] = [];
          if (mgrRow?.gestor_id) {
            const { data: boss } = await admin
              .from("people").select("id, nome, email")
              .eq("id", mgrRow.gestor_id).maybeSingle();
            if (boss) targets.push(boss);
          }
          const { data: directors } = await admin
            .from("people").select("id, nome, email")
            .eq("papel", "DIRETOR").eq("ativo", true);
          for (const d of directors || []) {
            if (!targets.some((t) => t.id === d.id)) targets.push(d);
          }

          const alert = `⚠️ Coleta de feedback parada: *${manager.manager_name}* não registrou feedbacks de ${items.length} pessoa(s) no ciclo iniciado em ${cycleStart}.`;
          for (const t of targets) {
            if (!t.email) continue;
            const p = await getPrefs(admin, t.id);
            if (p.slack) {
              const sid = await lookupSlackUserByEmail(t.email);
              if (sid) await sendSlackDM(sid, alert);
            }
            if (p.email) await sendEmail(t.email, "Coleta de feedback parada", `<p>${alert}</p>`);
          }
        }
      }
    }

    if (!dryRun && sent.length) {
      await admin.from("audit_logs").insert({
        entidade: "feedback_reminders",
        entidade_id: cycleStart,
        acao: "REMINDERS_SENT",
        payload: { sent, escalated, cycle_start: cycleStart, total_managers: byManager.size },
      });
    }

    return json({ success: true, cycle_start: cycleStart, managers: byManager.size, sent, escalated, dryRun });
  } catch (error: any) {
    console.error("[feedback-collection-reminders]", error?.message, error);
    return json({ error: error?.message ?? "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
