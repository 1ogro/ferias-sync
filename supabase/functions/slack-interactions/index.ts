import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET")!;
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function verifySlackRequest(body: string, timestamp: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const baseString = `v0:${timestamp}:${body}`;
  
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SLACK_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(baseString)
  );
  
  const hashArray = Array.from(new Uint8Array(signatureBytes));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const computedSignature = `v0=${hashHex}`;
  
  return computedSignature === signature;
}

async function resolveRespondent(slackUserId: string, supabase: any) {
  const r = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  });
  const d = await r.json();
  const email = d?.user?.profile?.email;
  if (!email) return null;
  const { data } = await supabase.from("people").select("id, nome").eq("email", email).maybeSingle();
  return data;
}

async function awardPoints(supabase: any, personId: string, points: number, reason: string, sourceId: string) {
  const { error } = await supabase.rpc("award_points", {
    p_person_id: personId,
    p_points: points,
    p_reason: reason,
    p_source_id: sourceId,
  });
  if (error) console.error("[award_points] error:", error);
}

async function completePeerPair(supabase: any, runId: string, reviewerId: string) {
  // Marks pair as completed and awards reviewer points (deduped via source_id).
  const { data: pair } = await supabase
    .from("peer_review_pairs")
    .select("id, completed_at")
    .eq("run_id", runId)
    .eq("reviewer_id", reviewerId)
    .maybeSingle();
  if (!pair) return;
  if (!pair.completed_at) {
    await supabase.from("peer_review_pairs").update({ completed_at: new Date().toISOString() }).eq("id", pair.id);
  }
  await awardPoints(supabase, reviewerId, 8, "peer_review", pair.id);
}


async function bumpResponseCount(runId: string, supabase: any) {
  const { count } = await supabase
    .from("pulse_responses").select("*", { count: "exact", head: true }).eq("run_id", runId);
  await supabase.from("pulse_runs").update({ responses_count: count || 0 }).eq("id", runId);
}

async function postEphemeralAck(payload: any, text: string) {
  if (!payload.channel?.id || !payload.user?.id) return;
  await fetch("https://slack.com/api/chat.postEphemeral", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel: payload.channel.id, user: payload.user.id, text }),
  });
}


serve(async (req) => {
  try {
    const body = await req.text();
    const timestamp = req.headers.get("X-Slack-Request-Timestamp") || "";
    const signature = req.headers.get("X-Slack-Signature") || "";

    // Verify request is from Slack
    const isValid = await verifySlackRequest(body, timestamp, signature);
    if (!isValid) {
      console.error("Invalid Slack signature");
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = JSON.parse(decodeURIComponent(body.replace("payload=", "")));
    console.log("Slack interaction payload type:", payload.type);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ============ PULSE / KUDOS FLOW ============

    const CATEGORY_LABEL: Record<string, string> = {
      teamwork: "🤝 Trabalho em equipe",
      innovation: "💡 Inovação",
      delivery: "🚀 Entrega",
      leadership: "🏆 Liderança",
      customer: "❤️ Foco no cliente",
    };

    // view_submission for kudos modal
    if (payload.type === "view_submission" && payload.view?.callback_id?.startsWith("kudos_submit:")) {
      const [, surveyId] = payload.view.callback_id.split(":");
      const v = payload.view.state.values || {};
      const toPersonId = v.kudo_to_block?.kudo_to_select?.selected_option?.value;
      const category = v.kudo_cat_block?.kudo_cat_select?.selected_option?.value || "teamwork";
      const message = (v.kudo_msg_block?.kudo_msg_input?.value || "").trim();
      const slackUserId = payload.user.id;

      const sender = await resolveRespondent(slackUserId, supabase);
      const errors: Record<string, string> = {};
      if (!sender) errors["kudo_msg_block"] = "Usuário não encontrado.";
      if (!toPersonId) errors["kudo_to_block"] = "Selecione um colega.";
      if (!message || message.length < 3) errors["kudo_msg_block"] = "Mensagem muito curta.";
      if (message.length > 500) errors["kudo_msg_block"] = "Máximo 500 caracteres.";
      if (sender && toPersonId === sender.id) errors["kudo_to_block"] = "Não dá para mandar kudos pra si mesmo 😉";
      if (Object.keys(errors).length) {
        return new Response(JSON.stringify({ response_action: "errors", errors }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const { data: survey } = await supabase
        .from("pulse_surveys")
        .select("kudos_channel, title")
        .eq("id", surveyId)
        .maybeSingle();

      const { data: to } = await supabase.from("people").select("nome, ativo").eq("id", toPersonId).maybeSingle();
      if (!to || !to.ativo) {
        return new Response(JSON.stringify({ response_action: "errors", errors: { kudo_to_block: "Destinatário inativo." } }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const channelToPost = survey?.kudos_channel?.trim() || null;
      const { data: kudo, error: insErr } = await supabase.from("kudos").insert({
        from_person_id: sender!.id,
        to_person_id: toPersonId,
        message,
        category,
        slack_channel_posted: channelToPost,
      }).select().single();

      if (!insErr && kudo) {
        await awardPoints(supabase, toPersonId, 10, "kudo_received", kudo.id);
        await awardPoints(supabase, sender!.id, 2, "kudo_given", kudo.id);

        if (channelToPost) {
          const { data: fromP } = await supabase.from("people").select("nome").eq("id", sender!.id).maybeSingle();
          const text = `${CATEGORY_LABEL[category] || "🎉"} *${fromP?.nome || "Alguém"}* deu kudos para *${to.nome}*\n> ${message}`;
          await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ channel: channelToPost, text }),
          });
        }
      } else if (insErr) {
        console.error("[kudos_submit] insert error:", insErr);
      }

      return new Response(JSON.stringify({ response_action: "clear" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // (awardPoints / completePeerPair are defined at module scope above)



    // view_submission for open-text pulse question
    if (payload.type === "view_submission" && payload.view?.callback_id?.startsWith("pulse_text:")) {
      const [, runId, questionId] = payload.view.callback_id.split(":");
      const text = payload.view.state.values?.pulse_text_block?.pulse_text_input?.value || "";
      const slackUserId = payload.user.id;
      console.log(`[pulse view_submission] run=${runId} q=${questionId} slack_user=${slackUserId}`);
      const respondent = await resolveRespondent(slackUserId, supabase);
      console.log(`[pulse view_submission] respondent=${respondent?.id ?? "NOT_FOUND"}`);
      if (respondent) {
        const { error: upErr } = await supabase.from("pulse_responses").upsert(
          { run_id: runId, question_id: questionId, respondent_id: respondent.id, text_value: text },
          { onConflict: "run_id,question_id,respondent_id" }
        );
        if (upErr) console.error("[pulse view_submission] upsert error:", upErr);
        else {
          await bumpResponseCount(runId, supabase);
          await awardPoints(supabase, respondent.id, 5, "pulse_response", runId);
          await completePeerPair(supabase, runId, respondent.id);
        }
      }

      return new Response(JSON.stringify({ response_action: "clear" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // block_actions for pulse
    if (payload.type === "block_actions" && payload.actions?.[0]) {
      const act = payload.actions[0];
      console.log(`[block_actions] action_id=${act.action_id}`);
      if (act.action_id?.startsWith("pulse_answer:")) {
        const [, runId, questionId, value] = act.action_id.split(":");
        const slackUserId = payload.user.id;
        console.log(`[pulse_answer] run=${runId} q=${questionId} value=${value} slack_user=${slackUserId}`);
        const respondent = await resolveRespondent(slackUserId, supabase);
        console.log(`[pulse_answer] respondent=${respondent?.id ?? "NOT_FOUND"}`);
        if (respondent) {
          const { error: upErr } = await supabase.from("pulse_responses").upsert(
            { run_id: runId, question_id: questionId, respondent_id: respondent.id, scale_value: parseInt(value, 10), slack_message_ts: payload.message?.ts },
            { onConflict: "run_id,question_id,respondent_id" }
          );
          if (upErr) {
            console.error("[pulse_answer] upsert error:", upErr);
          } else {
            await bumpResponseCount(runId, supabase);
            await awardPoints(supabase, respondent.id, 5, "pulse_response", runId);
            await completePeerPair(supabase, runId, respondent.id);
            await postEphemeralAck(payload, `✅ Resposta registrada: *${value}/5*`);
          }

        } else {
          await postEphemeralAck(payload, `⚠️ Não consegui identificar seu usuário no sistema (email do Slack não bate com nenhum colaborador).`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      if (act.action_id?.startsWith("pulse_text_open:")) {
        const [, runId, questionId] = act.action_id.split(":");
        const r = await fetch("https://slack.com/api/views.open", {
          method: "POST",
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            trigger_id: payload.trigger_id,
            view: {
              type: "modal",
              callback_id: `pulse_text:${runId}:${questionId}`,
              title: { type: "plain_text", text: "Responder" },
              submit: { type: "plain_text", text: "Enviar" },
              close: { type: "plain_text", text: "Cancelar" },
              blocks: [
                {
                  type: "input",
                  block_id: "pulse_text_block",
                  label: { type: "plain_text", text: "Sua resposta" },
                  element: {
                    type: "plain_text_input",
                    action_id: "pulse_text_input",
                    multiline: true,
                  },
                },
              ],
            },
          }),
        });
        const d = await r.json();
        if (!d.ok) console.error("[pulse_text_open] views.open error:", d);
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }

      // Unknown pulse-like or other block_action — don't fall into legacy approval handler
      if (!act.value) {
        console.log(`[block_actions] no value, ignoring action_id=${act.action_id}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
    }

    // ============ APPROVAL FLOW (legado) ============
    if (payload.type !== "block_actions" || !payload.actions?.[0]?.value) {
      console.log("[slack-interactions] no matching handler for payload type:", payload.type);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    const action = payload.actions[0];
    const requestId = action.value;
    const actionId = action.action_id;


    // Get request details
    const { data: request, error: requestError } = await supabase
      .from('requests')
      .select(`
        *,
        requester:people!requester_id(id, nome, email, gestor_id)
      `)
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      throw new Error("Request not found");
    }

    // Get approver from Slack user
    const slackUserId = payload.user.id;
    const userResponse = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
      headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const userData = await userResponse.json();
    const approverEmail = userData.user.profile.email;

    const { data: approver } = await supabase
      .from('people')
      .select('id, nome')
      .eq('email', approverEmail)
      .single();

    if (!approver) {
      throw new Error("Approver not found");
    }

    let newStatus = request.status;
    let level = '';

    if (actionId === 'approve_request') {
      // Determine approval level
      if (request.status === 'AGUARDANDO_GESTOR' || request.status === 'PENDENTE') {
        newStatus = 'AGUARDANDO_DIRETOR';
        level = 'GESTOR';
      } else if (request.status === 'AGUARDANDO_DIRETOR') {
        newStatus = 'APROVADO_FINAL';
        level = 'DIRETOR';
      }

      // Update request status
      await supabase
        .from('requests')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      // Create approval record
      await supabase.from('approvals').insert({
        request_id: requestId,
        approver_id: approver.id,
        level,
        acao: 'APROVADO',
        comentario: 'Aprovado via Slack',
      });

      // Update Slack message
      await fetch("https://slack.com/api/chat.update", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: payload.channel.id,
          ts: payload.message.ts,
          text: `✅ Solicitação aprovada por ${approver.nome}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*✅ Solicitação Aprovada*\n👤 ${request.requester.nome}\n📅 ${request.inicio} até ${request.fim}\n✓ Aprovado por ${approver.nome}`,
              },
            },
          ],
        }),
      });

      // Send email to requester
      await supabase.functions.invoke('send-notification-email', {
        body: {
          to: request.requester.email,
          subject: `Solicitação Aprovada`,
          text: `Sua solicitação de ${request.tipo} foi aprovada por ${approver.nome}.`,
        },
      });

    } else if (actionId === 'reject_request') {
      newStatus = 'REJEITADO';
      level = request.status === 'AGUARDANDO_DIRETOR' ? 'DIRETOR' : 'GESTOR';

      await supabase
        .from('requests')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      await supabase.from('approvals').insert({
        request_id: requestId,
        approver_id: approver.id,
        level,
        acao: 'REJEITADO',
        comentario: 'Rejeitado via Slack',
      });

      await fetch("https://slack.com/api/chat.update", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: payload.channel.id,
          ts: payload.message.ts,
          text: `❌ Solicitação rejeitada por ${approver.nome}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*❌ Solicitação Rejeitada*\n👤 ${request.requester.nome}\n📅 ${request.inicio} até ${request.fim}\n✗ Rejeitado por ${approver.nome}`,
              },
            },
          ],
        }),
      });

      await supabase.functions.invoke('send-notification-email', {
        body: {
          to: request.requester.email,
          subject: `Solicitação Rejeitada`,
          text: `Sua solicitação de ${request.tipo} foi rejeitada por ${approver.nome}.`,
        },
      });

    } else if (actionId === 'request_info') {
      newStatus = 'INFORMACOES_ADICIONAIS';

      await supabase
        .from('requests')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      await fetch("https://slack.com/api/chat.update", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: payload.channel.id,
          ts: payload.message.ts,
          text: `📋 Informações adicionais solicitadas por ${approver.nome}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*📋 Informações Adicionais Solicitadas*\n👤 ${request.requester.nome}\n📅 ${request.inicio} até ${request.fim}\n📝 Solicitado por ${approver.nome}`,
              },
            },
          ],
        }),
      });

      await supabase.functions.invoke('send-notification-email', {
        body: {
          to: request.requester.email,
          subject: `Informações Adicionais Necessárias`,
          text: `${approver.nome} solicitou informações adicionais sobre sua solicitação de ${request.tipo}.`,
        },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in slack-interactions:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
