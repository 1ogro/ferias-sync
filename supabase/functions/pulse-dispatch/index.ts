// Pulse dispatch — chamada por pg_cron a cada 15 min.
// Envia DMs no Slack para enquetes ativas cuja next_run_at já passou.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function slackAuthTest(): Promise<any> {
  try {
    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const data = await res.json();
    console.log("[slack auth.test]", JSON.stringify(data));
    // scopes vêm no header
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
    console.warn(`[lookupByEmail] ${email} -> ${JSON.stringify(data)}`);
    return { id: null, error: data.error, needed: data.needed };
  } catch (err) {
    console.error("lookupByEmail error:", err);
    return { id: null, error: String(err) };
  }
}

async function openIm(slackUserId: string): Promise<{ channel: string | null; error?: string; needed?: string }> {
  const res = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ users: slackUserId }),
  });
  const data = await res.json();
  if (data.ok) return { channel: data.channel.id };
  console.warn(`[conversations.open] ${slackUserId} -> ${JSON.stringify(data)}`);
  return { channel: null, error: data.error, needed: data.needed };
}

function nextRunFromFrequency(freq: string, base: Date): Date | null {
  const d = new Date(base);
  switch (freq) {
    case "daily": d.setDate(d.getDate() + 1); return d;
    case "weekly": d.setDate(d.getDate() + 7); return d;
    case "biweekly": d.setDate(d.getDate() + 14); return d;
    case "monthly": d.setMonth(d.getMonth() + 1); return d;
    default: return null; // once
  }
}

function buildBlocks(survey: any, questions: any[], runId: string) {
  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📊 ${survey.title}` },
    },
  ];
  if (survey.description) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: survey.description } });
  }
  if (survey.anonymous) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: "🕶️ _Suas respostas são anônimas._" }],
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

  return blocks;
}

async function dispatchSurvey(supabase: any, survey: any): Promise<{ sent: number; total: number; diagnostics: any[] }> {
  const diagnostics: any[] = [];
  const { data: questions } = await supabase
    .from("pulse_questions")
    .select("*")
    .eq("survey_id", survey.id)
    .order("position", { ascending: true });

  if (!questions || questions.length === 0) {
    console.warn(`Survey ${survey.id} has no questions, skipping`);
    return { sent: 0, total: 0, diagnostics: [{ status: "no_questions" }] };
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

  console.log(`[survey ${survey.id}] ${recipients.length} recipients`);

  const { data: run, error: runErr } = await supabase
    .from("pulse_runs")
    .insert({
      survey_id: survey.id,
      status: "pending",
      recipients_count: recipients.length,
    })
    .select()
    .single();

  if (runErr || !run) {
    console.error("Failed to create run:", runErr);
    return { sent: 0, total: recipients.length, diagnostics: [{ status: "run_create_failed", error: runErr?.message }] };
  }

  let sent = 0;
  for (const p of recipients) {
    const diag: any = { person_id: p.id, nome: p.nome, email: p.email };
    if (!p.email) {
      diag.status = "no_email";
      diagnostics.push(diag);
      continue;
    }
    const { data: pref } = await supabase
      .from("notification_preferences")
      .select("request_updates_slack")
      .eq("person_id", p.id)
      .maybeSingle();
    if (pref && pref.request_updates_slack === false) {
      diag.status = "opted_out";
      diagnostics.push(diag);
      continue;
    }

    const lookup = await lookupSlackUserByEmail(p.email);
    if (!lookup.id) {
      diag.status = "lookup_failed";
      diag.reason = lookup.error;
      diag.needed = lookup.needed;
      diagnostics.push(diag);
      continue;
    }
    diag.slack_user_id = lookup.id;

    const im = await openIm(lookup.id);
    if (!im.channel) {
      diag.status = "im_failed";
      diag.reason = im.error;
      diag.needed = im.needed;
      diagnostics.push(diag);
      continue;
    }

    const blocks = buildBlocks(survey, questions, run.id);
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: im.channel,
        text: `Nova enquete: ${survey.title}`,
        blocks,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      sent++;
      diag.status = "sent";
    } else {
      console.warn(`[chat.postMessage] ${p.email} -> ${JSON.stringify(data)}`);
      diag.status = "post_failed";
      diag.reason = data.error;
      diag.needed = data.needed;
    }
    diagnostics.push(diag);
  }

  const now = new Date();
  const next = nextRunFromFrequency(survey.frequency, now);
  await supabase
    .from("pulse_runs")
    .update({
      status: sent === recipients.length && sent > 0 ? "sent" : sent > 0 ? "partial" : "failed",
    })
    .eq("id", run.id);
  await supabase
    .from("pulse_surveys")
    .update({
      last_run_at: now.toISOString(),
      next_run_at: next ? next.toISOString() : null,
      active: next ? survey.active : false,
    })
    .eq("id", survey.id);

  await supabase.from("audit_logs").insert({
    entidade: "pulse_runs",
    entidade_id: run.id,
    acao: "DISPATCH",
    actor_id: survey.created_by,
    payload: { survey_id: survey.id, recipients: recipients.length, sent, diagnostics },
  });

  return { sent, total: recipients.length, diagnostics };
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
