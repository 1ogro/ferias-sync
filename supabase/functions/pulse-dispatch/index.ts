// Pulse dispatch — chamada por pg_cron a cada 15 min.
// Envia DMs no Slack para enquetes ativas cuja next_run_at já passou.
// Respeita janelas silenciosas (quiet_hours_*), aplica tom (formal/neutral/casual),
// e gera pares quando kind=peer.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Tone = "formal" | "neutral" | "casual";
const TONE: Record<Tone, { header: (t: string) => string; anon: string; peer: (n: string) => string; thanks: string }> = {
  formal: {
    header: (t) => `📋 ${t}`,
    anon: "Suas respostas serão tratadas de forma anônima.",
    peer: (n) => `Sua avaliação será sobre o(a) colega *${n}*.`,
    thanks: "Agradecemos sua participação.",
  },
  neutral: {
    header: (t) => `📊 ${t}`,
    anon: "🕶️ Suas respostas são anônimas.",
    peer: (n) => `Você está avaliando *${n}* nesta rodada.`,
    thanks: "Obrigado por responder!",
  },
  casual: {
    header: (t) => `✨ ${t}`,
    anon: "🤫 Pode mandar a real — é anônimo!",
    peer: (n) => `Bora dar um feedback pro *${n}*? 🎯`,
    thanks: "Valeu demais! 🙌",
  },
};

async function slackAuthTest(): Promise<any> {
  try {
    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const data = await res.json();
    console.log("[slack auth.test]", JSON.stringify(data));
    const scopes = res.headers.get("x-oauth-scopes");
    console.log("[slack scopes]", scopes);
    return { ...data, scopes };
  } catch (err) {
    console.error("auth.test error:", err);
    return { ok: false, error: String(err) };
  }
}

async function lookupSlackUserByEmail(email: string): Promise<{ id: string | null; error?: string; needed?: string }> {
  try {
    const res = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
    );
    const data = await res.json();
    if (data.ok && data.user?.id) return { id: data.user.id };
    return { id: null, error: data.error, needed: data.needed };
  } catch (err) {
    return { id: null, error: String(err) };
  }
}

async function openIm(slackUserId: string): Promise<{ channel: string | null; error?: string; needed?: string }> {
  const res = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ users: slackUserId }),
  });
  const data = await res.json();
  if (data.ok) return { channel: data.channel.id };
  return { channel: null, error: data.error, needed: data.needed };
}

function nextRunFromFrequency(freq: string, base: Date): Date | null {
  const d = new Date(base);
  switch (freq) {
    case "daily": d.setDate(d.getDate() + 1); return d;
    case "weekly": d.setDate(d.getDate() + 7); return d;
    case "biweekly": d.setDate(d.getDate() + 14); return d;
    case "monthly": d.setMonth(d.getMonth() + 1); return d;
    default: return null;
  }
}

// Returns minutes since midnight in the target timezone for `now`.
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

// Returns null if it's OK to send now; otherwise an ISO of when to retry.
function shouldDeferUntil(prefs: {
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  preferred_window_start?: string;
  preferred_window_end?: string;
  timezone?: string;
} | null): string | null {
  if (!prefs) return null;
  const tz = prefs.timezone || "America/Sao_Paulo";
  const now = nowMinutesInTZ(tz);
  const qs = timeStrToMinutes(prefs.quiet_hours_start || "12:00");
  const qe = timeStrToMinutes(prefs.quiet_hours_end || "14:00");
  const inQuiet = qs < qe ? (now >= qs && now < qe) : (now >= qs || now < qe);
  if (!inQuiet) return null;
  // Defer to end of quiet window (next occurrence) or preferred window start if later
  const target = prefs.preferred_window_start
    ? Math.max(qe, timeStrToMinutes(prefs.preferred_window_start))
    : qe;
  // Build target Date in tz. Simple approach: schedule N minutes ahead.
  const minutesAhead = target > now ? target - now : (24 * 60 - now) + target;
  const next = new Date(Date.now() + minutesAhead * 60_000);
  return next.toISOString();
}

function buildBlocks(survey: any, questions: any[], runId: string, opts: { subjectName?: string } = {}) {
  const tone = (survey.tone || "neutral") as Tone;
  const tpl = TONE[tone] || TONE.neutral;
  const blocks: any[] = [
    { type: "header", text: { type: "plain_text", text: tpl.header(survey.title) } },
  ];
  if (survey.description) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: survey.description } });
  }
  if (opts.subjectName) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: tpl.peer(opts.subjectName) } });
  }
  if (survey.anonymous || (survey.kind === "peer" && survey.peer_anonymous)) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: tpl.anon }],
    });
  }
  blocks.push({ type: "divider" });

  for (const q of questions) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${q.position + 1}. ${q.question_text}*${q.required ? " *_(obrigatória)_*" : ""}` },
    });
    if (q.question_type === "scale_1_5") {
      blocks.push({
        type: "actions",
        block_id: `q_${q.id}`,
        elements: [1, 2, 3, 4, 5].map((n) => ({
          type: "button",
          text: { type: "plain_text", text: String(n) },
          action_id: `pulse_answer:${runId}:${q.id}:${n}`,
          value: String(n),
          style: n >= 4 ? "primary" : undefined,
        })),
      });
    } else {
      blocks.push({
        type: "actions",
        block_id: `qt_${q.id}`,
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "✍️ Responder" },
            action_id: `pulse_text_open:${runId}:${q.id}`,
            value: "open",
          },
        ],
      });
    }
  }

  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: tpl.thanks }] });
  return blocks;
}

// Round-robin pair generator for peer review (no self-pair).
function generatePeerPairs(people: { id: string }[]): { reviewer: string; subject: string }[] {
  if (people.length < 2) return [];
  const shuffled = [...people].sort(() => Math.random() - 0.5);
  const n = shuffled.length;
  const pairs: { reviewer: string; subject: string }[] = [];
  for (let i = 0; i < n; i++) {
    pairs.push({ reviewer: shuffled[i].id, subject: shuffled[(i + 1) % n].id });
  }
  return pairs;
}

async function dispatchSurvey(supabase: any, survey: any): Promise<{ sent: number; total: number; deferred: number; diagnostics: any[] }> {
  const diagnostics: any[] = [];
  const { data: questions } = await supabase
    .from("pulse_questions")
    .select("*")
    .eq("survey_id", survey.id)
    .order("position", { ascending: true });

  if (!questions || questions.length === 0) {
    return { sent: 0, total: 0, deferred: 0, diagnostics: [{ status: "no_questions" }] };
  }

  let recipients: any[] = [];
  if (survey.target_scope === "team" && survey.target_team_id) {
    const { data } = await supabase
      .from("people")
      .select("id, nome, email")
      .eq("sub_time", survey.target_team_id)
      .eq("ativo", true);
    recipients = data || [];
  } else if (survey.target_scope === "custom" && survey.target_person_ids?.length) {
    const { data } = await supabase
      .from("people")
      .select("id, nome, email")
      .in("id", survey.target_person_ids)
      .eq("ativo", true);
    recipients = data || [];
  }

  console.log(`[survey ${survey.id}] kind=${survey.kind} tone=${survey.tone} recipients=${recipients.length}`);

  const { data: run, error: runErr } = await supabase
    .from("pulse_runs")
    .insert({ survey_id: survey.id, status: "pending", recipients_count: recipients.length })
    .select()
    .single();

  if (runErr || !run) {
    return { sent: 0, total: recipients.length, deferred: 0, diagnostics: [{ status: "run_create_failed", error: runErr?.message }] };
  }

  // Peer pairing
  const subjectByReviewer = new Map<string, { id: string; nome: string }>();
  if (survey.kind === "peer") {
    const pairs = generatePeerPairs(recipients);
    const peopleById = new Map(recipients.map((p) => [p.id, p]));
    if (pairs.length) {
      await supabase.from("peer_review_pairs").insert(
        pairs.map((p) => ({ survey_id: survey.id, run_id: run.id, reviewer_id: p.reviewer, subject_id: p.subject }))
      );
      for (const p of pairs) subjectByReviewer.set(p.reviewer, peopleById.get(p.subject)!);
    }
  }

  let sent = 0;
  let deferred = 0;
  let earliestDefer: string | null = null;

  for (const p of recipients) {
    const diag: any = { person_id: p.id, nome: p.nome, email: p.email };
    if (!p.email) { diag.status = "no_email"; diagnostics.push(diag); continue; }

    const { data: pref } = await supabase
      .from("notification_preferences")
      .select("request_updates_slack, quiet_hours_start, quiet_hours_end, preferred_window_start, preferred_window_end, timezone")
      .eq("person_id", p.id)
      .maybeSingle();

    if (pref && pref.request_updates_slack === false) {
      diag.status = "opted_out"; diagnostics.push(diag); continue;
    }

    const deferUntil = shouldDeferUntil(pref);
    if (deferUntil) {
      diag.status = "deferred";
      diag.defer_until = deferUntil;
      deferred++;
      if (!earliestDefer || deferUntil < earliestDefer) earliestDefer = deferUntil;
      diagnostics.push(diag);
      continue;
    }

    const lookup = await lookupSlackUserByEmail(p.email);
    if (!lookup.id) { diag.status = "lookup_failed"; diag.reason = lookup.error; diag.needed = lookup.needed; diagnostics.push(diag); continue; }
    diag.slack_user_id = lookup.id;

    const im = await openIm(lookup.id);
    if (!im.channel) { diag.status = "im_failed"; diag.reason = im.error; diag.needed = im.needed; diagnostics.push(diag); continue; }

    const subject = subjectByReviewer.get(p.id);
    if (survey.kind === "peer" && !subject) {
      diag.status = "no_subject_assigned"; diagnostics.push(diag); continue;
    }

    const blocks = buildBlocks(survey, questions, run.id, { subjectName: subject?.nome });
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: im.channel,
        text: `Nova enquete: ${survey.title}`,
        blocks,
        metadata: subject ? { event_type: "pulse_peer", event_payload: { subject_id: subject.id } } : undefined,
      }),
    });
    const data = await res.json();
    if (data.ok) { sent++; diag.status = "sent"; }
    else { diag.status = "post_failed"; diag.reason = data.error; diag.needed = data.needed; }
    diagnostics.push(diag);
  }

  const now = new Date();
  const next = nextRunFromFrequency(survey.frequency, now);

  // If everyone was deferred (and nothing sent), reschedule the survey to the earliest defer time.
  const allDeferred = deferred > 0 && sent === 0 && deferred === recipients.length;
  const newNextRun = allDeferred && earliestDefer
    ? earliestDefer
    : (next ? next.toISOString() : null);

  await supabase
    .from("pulse_runs")
    .update({
      status: allDeferred ? "deferred" : (sent === recipients.length && sent > 0 ? "sent" : sent > 0 ? "partial" : "failed"),
    })
    .eq("id", run.id);

  await supabase
    .from("pulse_surveys")
    .update({
      last_run_at: allDeferred ? survey.last_run_at : now.toISOString(),
      next_run_at: newNextRun,
      active: allDeferred ? true : (next ? survey.active : false),
    })
    .eq("id", survey.id);

  await supabase.from("audit_logs").insert({
    entidade: "pulse_runs",
    entidade_id: run.id,
    acao: "DISPATCH",
    actor_id: survey.created_by,
    payload: { survey_id: survey.id, recipients: recipients.length, sent, deferred, diagnostics },
  });

  return { sent, total: recipients.length, deferred, diagnostics };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const surveyId = body?.surveyId;

    const auth = await slackAuthTest();

    let query = supabase.from("pulse_surveys").select("*");
    if (surveyId) {
      query = query.eq("id", surveyId);
    } else {
      query = query.eq("active", true).lte("next_run_at", new Date().toISOString());
    }
    const { data: surveys, error } = await query;
    if (error) throw error;

    const results: any[] = [];
    for (const s of surveys || []) {
      const r = await dispatchSurvey(supabase, s);
      results.push({ survey_id: s.id, title: s.title, ...r });
    }

    return new Response(JSON.stringify({ ok: true, slack: auth, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("pulse-dispatch error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
