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

function buildBlocks(survey: any, questions: any[], runId: string, opts: { subjectName?: string; pairId?: string } = {}) {
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
    // Action IDs for peer: append pairId as 5th/4th segment so respondents can be linked to the subject.
    const suffix = opts.pairId ? `:${opts.pairId}` : "";
    if (q.question_type === "scale_1_5") {
      blocks.push({
        type: "actions",
        block_id: `q_${q.id}`,
        elements: [1, 2, 3, 4, 5].map((n) => ({
          type: "button",
          text: { type: "plain_text", text: String(n) },
          action_id: `pulse_answer:${runId}:${q.id}:${n}${suffix}`,
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
            action_id: `pulse_text_open:${runId}:${q.id}${suffix}`,
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
// Returns K pairs per reviewer by shifting the shuffled ring by offsets 1..K.
function generateRoundRobinPairs(people: { id: string }[], k: number = 1): { reviewer: string; subject: string }[] {
  if (people.length < 2) return [];
  const shuffled = [...people].sort(() => Math.random() - 0.5);
  const n = shuffled.length;
  const K = Math.min(Math.max(1, k), n - 1);
  const pairs: { reviewer: string; subject: string }[] = [];
  for (let offset = 1; offset <= K; offset++) {
    for (let i = 0; i < n; i++) {
      pairs.push({ reviewer: shuffled[i].id, subject: shuffled[(i + offset) % n].id });
    }
  }
  return pairs;
}

// Random pair generator: each reviewer gets K distinct random subjects (no self-pair).
function generateRandomPairs(people: { id: string }[], k: number = 1): { reviewer: string; subject: string }[] {
  if (people.length < 2) return [];
  const ids = people.map((p) => p.id);
  const n = ids.length;
  const K = Math.min(Math.max(1, k), n - 1);
  const pairs: { reviewer: string; subject: string }[] = [];
  for (const rid of ids) {
    const candidates = ids.filter((x) => x !== rid).sort(() => Math.random() - 0.5).slice(0, K);
    for (const sid of candidates) pairs.push({ reviewer: rid, subject: sid });
  }
  return pairs;
}

function buildKudosBlocks(survey: any) {
  const tone = (survey.tone || "neutral") as Tone;
  const tpl = TONE[tone] || TONE.neutral;
  const defaultPrompt =
    tone === "formal" ? "Reconheça um colega que se destacou nesta semana."
    : tone === "casual" ? "Bora reconhecer quem brilhou essa semana? 🌟"
    : "Quem do time merece um kudo hoje?";
  const text = survey.prompt_text?.trim() || defaultPrompt;
  return [
    { type: "header", text: { type: "plain_text", text: tpl.header(survey.title) } },
    { type: "section", text: { type: "mrkdwn", text } },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "🎉 Dar kudos" },
          action_id: `give_kudos_open:${survey.id}`,
          value: survey.id,
          style: "primary",
        },
      ],
    },
    { type: "context", elements: [{ type: "mrkdwn", text: tpl.thanks }] },
  ];
}

async function dispatchSurvey(supabase: any, survey: any): Promise<{ sent: number; total: number; deferred: number; diagnostics: any[] }> {
  const diagnostics: any[] = [];
  const isKudos = survey.kind === "kudos";
  let questions: any[] = [];
  if (!isKudos) {
    const { data } = await supabase
      .from("pulse_questions")
      .select("*")
      .eq("survey_id", survey.id)
      .order("position", { ascending: true });
    questions = data || [];
    if (questions.length === 0) {
      return { sent: 0, total: 0, deferred: 0, diagnostics: [{ status: "no_questions" }] };
    }
  }

  let recipients: any[] = [];
  if (survey.target_scope === "all") {
    const { data } = await supabase
      .from("people")
      .select("id, nome, email, sub_time")
      .eq("ativo", true);
    recipients = data || [];
  } else if (survey.target_scope === "teams") {
    const teamIds: string[] = survey.target_team_ids?.length
      ? survey.target_team_ids
      : (survey.target_team_id ? [survey.target_team_id] : []);
    if (teamIds.length) {
      const { data } = await supabase
        .from("people")
        .select("id, nome, email, sub_time")
        .in("sub_time", teamIds)
        .eq("ativo", true);
      recipients = data || [];
    }
  } else if (survey.target_scope === "team" && survey.target_team_id) {
    // legacy fallback
    const { data } = await supabase
      .from("people")
      .select("id, nome, email, sub_time")
      .eq("sub_time", survey.target_team_id)
      .eq("ativo", true);
    recipients = data || [];
  } else if (survey.target_scope === "custom" && survey.target_person_ids?.length) {
    const { data } = await supabase
      .from("people")
      .select("id, nome, email, sub_time")
      .in("id", survey.target_person_ids)
      .eq("ativo", true);
    recipients = data || [];
  }

  console.log(`[survey ${survey.id}] kind=${survey.kind} tone=${survey.tone} recipients=${recipients.length}`);

  const deadlineAt = survey.response_deadline_hours && survey.response_deadline_hours > 0
    ? new Date(Date.now() + survey.response_deadline_hours * 3600_000).toISOString()
    : null;

  const { data: run, error: runErr } = await supabase
    .from("pulse_runs")
    .insert({
      survey_id: survey.id,
      status: "pending",
      recipients_count: recipients.length,
      deadline_at: deadlineAt,
    })
    .select()
    .single();

  if (runErr || !run) {
    return { sent: 0, total: recipients.length, deferred: 0, diagnostics: [{ status: "run_create_failed", error: runErr?.message }] };
  }

  // Peer pairing (Map<reviewerId, {pairId, subject}[]>)
  const pairsByReviewer = new Map<string, { pairId: string; subject: { id: string; nome: string } }[]>();
  const peopleById = new Map(recipients.map((p) => [p.id, p]));
  let pairsCreated = 0;

  if (survey.kind === "peer") {
    const strategy: string = survey.peer_pairing_strategy || "round_robin";
    const K = Math.min(5, Math.max(1, Number(survey.peer_reviews_per_reviewer) || 1));
    let pairs: { reviewer: string; subject: string }[] = [];

    if (strategy === "fixed") {
      const fixed = Array.isArray(survey.peer_fixed_pairs) ? survey.peer_fixed_pairs : [];
      const seen = new Set<string>();
      pairs = fixed
        .filter((fp: any) =>
          fp?.reviewer_id &&
          fp?.subject_id &&
          fp.reviewer_id !== fp.subject_id &&
          peopleById.has(fp.reviewer_id) &&
          peopleById.has(fp.subject_id)
        )
        .filter((fp: any) => {
          const k = `${fp.reviewer_id}:${fp.subject_id}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .map((fp: any) => ({ reviewer: fp.reviewer_id, subject: fp.subject_id }));
    } else {
      const groups = new Map<string, typeof recipients>();
      for (const p of recipients) {
        const key = p.sub_time ?? "__no_team__";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
      }
      const gen = strategy === "random" ? generateRandomPairs : generateRoundRobinPairs;
      pairs = [...groups.values()].flatMap((g) => gen(g, K));
    }

    if (pairs.length) {
      const { data: inserted, error: pairErr } = await supabase
        .from("peer_review_pairs")
        .insert(
          pairs.map((p) => ({
            survey_id: survey.id,
            run_id: run.id,
            reviewer_id: p.reviewer,
            subject_id: p.subject,
          }))
        )
        .select("id, reviewer_id, subject_id");
      if (pairErr) {
        console.error("[peer pairs insert] error:", pairErr);
      }
      for (const row of inserted || []) {
        const subj = peopleById.get(row.subject_id);
        if (!subj) continue;
        const list = pairsByReviewer.get(row.reviewer_id) || [];
        list.push({ pairId: row.id, subject: subj });
        pairsByReviewer.set(row.reviewer_id, list);
      }
      pairsCreated = (inserted || []).length;
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

    // For peer: send one DM per pair. For self/others: single DM.
    const reviewerPairs = pairsByReviewer.get(p.id) || [];
    if (survey.kind === "peer" && reviewerPairs.length === 0) {
      diag.status = "no_subject_assigned"; diagnostics.push(diag); continue;
    }

    const deliveries: { pairId?: string; subject?: { id: string; nome: string } }[] =
      isKudos
        ? [{}]
        : survey.kind === "peer"
          ? reviewerPairs.map((rp) => ({ pairId: rp.pairId, subject: rp.subject }))
          : [{}];

    let anyOk = false;
    const perPairDiag: any[] = [];
    for (const d of deliveries) {
      const blocks = isKudos
        ? buildKudosBlocks(survey)
        : buildBlocks(survey, questions, run.id, { subjectName: d.subject?.nome, pairId: d.pairId });
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: im.channel,
          text: isKudos
            ? `Kudos: ${survey.title}`
            : (d.subject ? `Nova avaliação: ${survey.title} (avaliando ${d.subject.nome})` : `Nova enquete: ${survey.title}`),
          blocks,
          metadata: d.subject
            ? { event_type: "pulse_peer", event_payload: { subject_id: d.subject.id, pair_id: d.pairId } }
            : undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        anyOk = true;
        // Track per-pair message on peer_review_pairs
        if (d.pairId) {
          await supabase
            .from("peer_review_pairs")
            .update({
              slack_channel: im.channel,
              slack_message_ts: data.ts,
              sent_at: new Date().toISOString(),
            })
            .eq("id", d.pairId);
        }
        perPairDiag.push({ pair_id: d.pairId ?? null, subject_id: d.subject?.id ?? null, status: "sent" });
        // Per-pair audit log for peer review dispatch
        if (survey.kind === "peer" && d.pairId) {
          await supabase.from("audit_logs").insert({
            entidade: "peer_review_pairs",
            entidade_id: d.pairId,
            acao: "PEER_PAIR_SENT",
            actor_id: survey.created_by,
            payload: {
              survey_id: survey.id,
              run_id: run.id,
              reviewer_id: p.id,
              subject_id: d.subject?.id ?? null,
              slack_channel: im.channel,
              slack_message_ts: data.ts,
              k: Math.min(5, Math.max(1, Number(survey.peer_reviews_per_reviewer) || 1)),
            },
          });
        }
      } else {
        perPairDiag.push({ pair_id: d.pairId ?? null, subject_id: d.subject?.id ?? null, status: "post_failed", reason: data.error, needed: data.needed });
        if (survey.kind === "peer") {
          await supabase.from("audit_logs").insert({
            entidade: "peer_review_pairs",
            entidade_id: d.pairId ?? run.id,
            acao: "PEER_PAIR_SEND_FAILED",
            actor_id: survey.created_by,
            payload: {
              survey_id: survey.id,
              run_id: run.id,
              reviewer_id: p.id,
              subject_id: d.subject?.id ?? null,
              pair_id: d.pairId ?? null,
              reason: data.error,
              needed: data.needed,
              k: Math.min(5, Math.max(1, Number(survey.peer_reviews_per_reviewer) || 1)),
            },
          });
        }
      }
    }

    if (anyOk) {
      sent++;
      diag.status = "sent";
      diag.deliveries = perPairDiag;
      if (!isKudos) {
        await supabase.from("pulse_run_recipients").upsert(
          {
            run_id: run.id,
            person_id: p.id,
            slack_user_id: lookup.id,
            slack_channel: im.channel,
            sent_at: new Date().toISOString(),
            pairs_total: survey.kind === "peer" ? reviewerPairs.length : 0,
            pairs_completed: 0,
          },
          { onConflict: "run_id,person_id" }
        );
      }
    } else {
      diag.status = "post_failed"; diag.deliveries = perPairDiag;
    }
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
    payload: { survey_id: survey.id, recipients: recipients.length, sent, deferred, pairs_created: pairsCreated, diagnostics },
  });

  return { sent, total: recipients.length, deferred, pairs_created: pairsCreated, diagnostics };
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
