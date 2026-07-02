// Pulse reminders — chamada por pg_cron a cada ~15 min.
// Envia lembretes no Slack para quem ainda não respondeu, conforme
// os offsets configurados (horas antes do deadline) em `pulse_surveys.reminder_offsets_hours`.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Janela do cron (em ms). O cron roda a cada 15 min; usamos 20 min para dar folga.
const CRON_WINDOW_MS = 20 * 60_000;

function nowMinutesInTZ(timezone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const hh = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const mm = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  return hh * 60 + mm;
}
function timeStrToMinutes(t: string): number {
  const [hh, mm] = t.split(":").map((x) => parseInt(x, 10));
  return hh * 60 + (mm || 0);
}
function inQuietHours(prefs: any): boolean {
  if (!prefs) return false;
  const tz = prefs.timezone || "America/Sao_Paulo";
  const now = nowMinutesInTZ(tz);
  const qs = timeStrToMinutes(prefs.quiet_hours_start || "12:00");
  const qe = timeStrToMinutes(prefs.quiet_hours_end || "14:00");
  return qs < qe ? (now >= qs && now < qe) : (now >= qs || now < qe);
}

function reminderText(survey: any, hoursLeft: number, subjectName?: string): string {
  const base = subjectName
    ? `⏰ Lembrete: você ainda não respondeu o pulse *${survey.title}* (avaliando *${subjectName}*).`
    : `⏰ Lembrete: você ainda não respondeu o pulse *${survey.title}*.`;
  if (hoursLeft <= 0) {
    return `${base}\nO prazo já venceu — responda o quanto antes se ainda for possível.`;
  }
  const label = hoursLeft >= 2 ? `${Math.round(hoursLeft)} horas` : `menos de 2 horas`;
  return `${base}\nFalta ${label} para o prazo.`;
}

async function sendReminderDM(channel: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      channel,
      text,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text } },
        { type: "context", elements: [{ type: "mrkdwn", text: "Abra a mensagem original acima para responder." }] },
      ],
    }),
  });
  const data = await res.json();
  return { ok: !!data.ok, error: data.error };
}

async function processRun(supabase: any, run: any): Promise<{ processed: number; sent: number }> {
  const survey = run.survey;
  if (!survey?.reminder_enabled) return { processed: 0, sent: 0 };
  const offsets: number[] = Array.isArray(survey.reminder_offsets_hours) ? survey.reminder_offsets_hours : [];
  if (!offsets.length) return { processed: 0, sent: 0 };

  const deadlineMs = new Date(run.deadline_at).getTime();
  const now = Date.now();
  const alreadySent: number[] = (run.reminders_sent_at || []).map((ts: string) => new Date(ts).getTime());

  // Pick offsets whose fire time is within [now-CRON_WINDOW, now] AND not already sent for that offset.
  const dueOffsets: number[] = [];
  for (const oh of offsets) {
    const fireAt = deadlineMs - oh * 3600_000;
    if (fireAt > now) continue;
    // dedupe: skip if we already fired a reminder within CRON_WINDOW around this offset
    const alreadyFired = alreadySent.some((ts) => Math.abs(ts - fireAt) < CRON_WINDOW_MS);
    if (alreadyFired) continue;
    // don't fire arbitrarily old offsets (more than 24h late)
    if (now - fireAt > 24 * 3600_000) continue;
    dueOffsets.push(oh);
  }
  if (!dueOffsets.length) return { processed: 0, sent: 0 };

  // Fetch pending recipients (not yet responded)
  const { data: recipients } = await supabase
    .from("pulse_run_recipients")
    .select("id, person_id, slack_channel, reminders_sent_count")
    .eq("run_id", run.id)
    .is("responded_at", null);

  if (!recipients || recipients.length === 0) {
    // mark offsets as processed so we don't loop
    await supabase
      .from("pulse_runs")
      .update({ reminders_sent_at: [...(run.reminders_sent_at || []), new Date().toISOString()] })
      .eq("id", run.id);
    return { processed: dueOffsets.length, sent: 0 };
  }

  // Peer pair subject names (for context in reminder)
  const subjectByReviewer = new Map<string, string>();
  if (survey.kind === "peer") {
    const { data: pairs } = await supabase
      .from("peer_review_pairs")
      .select("reviewer_id, subject_id")
      .eq("run_id", run.id);
    const subjectIds = [...new Set((pairs || []).map((p: any) => p.subject_id))];
    if (subjectIds.length) {
      const { data: subjects } = await supabase
        .from("people")
        .select("id, nome")
        .in("id", subjectIds);
      const byId = new Map((subjects || []).map((s: any) => [s.id, s.nome]));
      for (const p of pairs || []) subjectByReviewer.set(p.reviewer_id, byId.get(p.subject_id) || "");
    }
  }

  const hoursLeft = Math.max(0, (deadlineMs - now) / 3600_000);
  let sent = 0;
  const diagnostics: any[] = [];

  for (const r of recipients) {
    // opt-out or quiet hours
    const { data: pref } = await supabase
      .from("notification_preferences")
      .select("request_updates_slack, quiet_hours_start, quiet_hours_end, timezone")
      .eq("person_id", r.person_id)
      .maybeSingle();
    if (pref?.request_updates_slack === false) {
      diagnostics.push({ person_id: r.person_id, status: "opted_out" });
      continue;
    }
    if (inQuietHours(pref)) {
      diagnostics.push({ person_id: r.person_id, status: "quiet_hours" });
      continue;
    }
    if (!r.slack_channel) {
      diagnostics.push({ person_id: r.person_id, status: "no_channel" });
      continue;
    }
    const text = reminderText(survey, hoursLeft, subjectByReviewer.get(r.person_id));
    const res = await sendReminderDM(r.slack_channel, text);
    if (res.ok) {
      sent++;
      await supabase
        .from("pulse_run_recipients")
        .update({ reminders_sent_count: (r.reminders_sent_count || 0) + 1 })
        .eq("id", r.id);
      diagnostics.push({ person_id: r.person_id, status: "sent" });
    } else {
      diagnostics.push({ person_id: r.person_id, status: "failed", error: res.error });
    }
  }

  // Mark each due offset as processed by appending its fire time
  const marks = dueOffsets.map((oh) => new Date(deadlineMs - oh * 3600_000).toISOString());
  await supabase
    .from("pulse_runs")
    .update({ reminders_sent_at: [...(run.reminders_sent_at || []), ...marks] })
    .eq("id", run.id);

  await supabase.from("audit_logs").insert({
    entidade: "pulse_runs",
    entidade_id: run.id,
    acao: "REMINDER",
    actor_id: survey.created_by,
    payload: { survey_id: survey.id, offsets: dueOffsets, sent, pending: recipients.length, diagnostics },
  });

  return { processed: dueOffsets.length, sent };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const nowIso = new Date().toISOString();
    // Runs with a deadline and still within the useful reminder window (deadline in future or up to 24h in the past)
    const windowStart = new Date(Date.now() - 24 * 3600_000).toISOString();

    const { data: runs, error } = await supabase
      .from("pulse_runs")
      .select("id, survey_id, deadline_at, reminders_sent_at, survey:pulse_surveys!inner(id, title, kind, created_by, reminder_enabled, reminder_offsets_hours, response_deadline_hours)")
      .not("deadline_at", "is", null)
      .gte("deadline_at", windowStart)
      .neq("status", "failed");

    if (error) throw error;

    let totalSent = 0;
    for (const run of runs || []) {
      if (!run.survey?.reminder_enabled) continue;
      const { sent } = await processRun(supabase, run);
      totalSent += sent;
    }

    return new Response(
      JSON.stringify({ ok: true, runs_checked: runs?.length ?? 0, reminders_sent: totalSent, at: nowIso }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[pulse-reminders] error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
