// pulse-response-notify — sends manager alert when a pulse response crosses
// configured thresholds. Idempotent per response_id via audit_logs.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyRecipient } from "../_shared/notify-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { response_id } = await req.json().catch(() => ({}));
    if (!response_id) {
      return new Response(JSON.stringify({ error: "response_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Idempotency: bail if already processed
    const { data: existing } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entidade", "pulse_responses")
      .eq("entidade_id", response_id)
      .eq("acao", "PULSE_NOTIFY_MANAGER")
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ skipped: "already_processed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: response, error: respErr } = await admin
      .from("pulse_responses")
      .select("id, run_id, question_id, respondent_id, scale_value, text_value")
      .eq("id", response_id)
      .maybeSingle();
    if (respErr || !response) {
      return new Response(JSON.stringify({ error: "response not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: run } = await admin
      .from("pulse_runs").select("id, survey_id").eq("id", response.run_id).maybeSingle();
    if (!run) return new Response(JSON.stringify({ error: "run not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: survey } = await admin
      .from("pulse_surveys")
      .select("id, title, anonymous, notify_manager_on_negative, notify_manager_on_positive, notify_negative_threshold, notify_positive_threshold, notify_include_text_responses")
      .eq("id", run.survey_id).maybeSingle();
    if (!survey) return new Response(JSON.stringify({ error: "survey not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const wantsNeg = !!(survey as any).notify_manager_on_negative;
    const wantsPos = !!(survey as any).notify_manager_on_positive;
    const includeText = !!(survey as any).notify_include_text_responses;
    if (!wantsNeg && !wantsPos) {
      return new Response(JSON.stringify({ skipped: "notifications_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let sentiment: "negative" | "positive" | null = null;
    if (typeof response.scale_value === "number") {
      const negT = (survey as any).notify_negative_threshold ?? 2;
      const posT = (survey as any).notify_positive_threshold ?? 4;
      if (wantsNeg && response.scale_value <= negT) sentiment = "negative";
      else if (wantsPos && response.scale_value >= posT) sentiment = "positive";
    } else if (response.text_value && wantsNeg && includeText) {
      sentiment = "negative";
    }
    if (!sentiment) {
      return new Response(JSON.stringify({ skipped: "below_threshold" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: respondent } = await admin
      .from("people").select("id, nome, gestor_id").eq("id", response.respondent_id).maybeSingle();
    if (!respondent?.gestor_id) {
      return new Response(JSON.stringify({ skipped: "no_manager" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: manager } = await admin
      .from("people").select("id, nome, email, ativo").eq("id", respondent.gestor_id).maybeSingle();
    if (!manager || !manager.ativo || !manager.email) {
      return new Response(JSON.stringify({ skipped: "manager_inactive" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: question } = await admin
      .from("pulse_questions").select("question_text").eq("id", response.question_id).maybeSingle();

    const respondentLabel = survey.anonymous ? "Respondente anônimo" : (respondent.nome || "Colaborador");
    const valueText = typeof response.scale_value === "number"
      ? `${response.scale_value}/5`
      : (response.text_value ? `"${String(response.text_value).slice(0, 200)}"` : "—");
    const emoji = sentiment === "negative" ? "⚠️" : "🌟";
    const sentimentLabel = sentiment === "negative" ? "Resposta negativa" : "Resposta positiva";

    const slackText =
      `${emoji} *${sentimentLabel}* na enquete *${survey.title}*\n` +
      (question?.question_text ? `> ${question.question_text}\n` : "") +
      `*Resposta:* ${valueText}\n` +
      `*De:* ${respondentLabel}`;

    const emailSubject = `${emoji} ${sentimentLabel} em "${survey.title}"`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color:${sentiment === "negative" ? "#dc2626" : "#16a34a"};">${emoji} ${sentimentLabel}</h2>
        <p>Olá <strong>${manager.nome}</strong>,</p>
        <p>Uma resposta na enquete <strong>${survey.title}</strong> atingiu o critério configurado.</p>
        ${question?.question_text ? `<p><strong>Pergunta:</strong> ${question.question_text}</p>` : ""}
        <p><strong>Resposta:</strong> ${valueText}</p>
        <p><strong>Respondente:</strong> ${respondentLabel}</p>
        <p style="color:#666;font-size:12px;margin-top:24px;">Este é um email automático, por favor não responda.</p>
      </div>`;

    await notifyRecipient(
      admin,
      { person_id: manager.id, email: manager.email, nome: manager.nome },
      { slackText, emailSubject, emailHtml }
    );

    await admin.from("audit_logs").insert({
      entidade: "pulse_responses",
      entidade_id: response_id,
      acao: "PULSE_NOTIFY_MANAGER",
      actor_id: respondent.id,
      payload: {
        survey_id: survey.id,
        manager_id: manager.id,
        sentiment,
        anonymous: survey.anonymous,
        scale_value: response.scale_value,
      },
    });

    return new Response(JSON.stringify({ ok: true, sentiment, manager_id: manager.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("pulse-response-notify error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
