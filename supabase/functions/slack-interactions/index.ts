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

async function notifyRecipientDM(
  supabase: any,
  toPersonId: string,
  fromName: string,
  category: string,
  message: string,
  context: string
) {
  try {
    const { data: toP } = await supabase
      .from("people")
      .select("email, nome")
      .eq("id", toPersonId)
      .maybeSingle();
    if (!toP?.email) {
      console.log(`[${context}] dm skipped: recipient has no email (${toPersonId})`);
      return;
    }

    const lookupRes = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(toP.email)}`,
      { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
    );
    const lookup = await lookupRes.json();
    if (!lookup.ok || !lookup.user?.id) {
      console.log(`[${context}] dm skipped: slack user not found for ${toP.email} (${lookup.error || "unknown"})`);
      return;
    }
    const slackUserId = lookup.user.id;

    const openRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ users: slackUserId }),
    });
    const open = await openRes.json();
    const channelId = open?.channel?.id;
    if (!open.ok || !channelId) {
      console.log(`[${context}] dm skipped: conversations.open failed (${open.error || "unknown"})`);
      return;
    }

    const CATEGORY_LABEL_LOCAL: Record<string, string> = {
      teamwork: "🤝 Trabalho em equipe",
      innovation: "💡 Inovação",
      delivery: "🚀 Entrega",
      leadership: "🏆 Liderança",
      customer: "❤️ Foco no cliente",
    };
    const catLabel = CATEGORY_LABEL_LOCAL[category] || "🍪";
    const text =
      `🍪 *Você ganhou um biscoito!*\n` +
      `${catLabel}\n` +
      `De: *${fromName}*\n` +
      `> ${message}\n\n` +
      `Veja seu feed em /engagement`;

    const postRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: channelId, text }),
    });
    const post = await postRes.json();
    if (!post.ok) {
      console.log(`[${context}] dm skipped: chat.postMessage failed (${post.error || "unknown"})`);
      return;
    }
    console.log(`[${context}] dm sent to ${slackUserId}`);
  } catch (e: any) {
    console.error(`[${context}] dm error:`, e?.message || e);
  }
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

        const { data: fromP } = await supabase.from("people").select("nome").eq("id", sender!.id).maybeSingle();
        const fromName = fromP?.nome || "Alguém";

        if (channelToPost) {
          const text = `${CATEGORY_LABEL[category] || "🎉"} *${fromName}* deu kudos para *${to.nome}*\n> ${message}`;
          await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ channel: channelToPost, text }),
          });
        }

        await notifyRecipientDM(supabase, toPersonId, fromName, category, message, "kudos_submit");

        // Fire-and-forget notification to direct manager + all directors
        supabase.functions.invoke("kudos-notify-managers", { body: { kudo_id: kudo.id } })
          .catch((e: any) => console.error("[kudos_submit] notify invoke failed", e?.message));

      } else if (insErr) {
        console.error("[kudos_submit] insert error:", insErr);
      }

      return new Response(JSON.stringify({ response_action: "clear" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // view_submission for /biscoito slash command
    if (payload.type === "view_submission" && payload.view?.callback_id === "biscoito_submit") {
      const v = payload.view.state.values || {};
      const toRaw = v.kudo_to_block?.kudo_to_select?.selected_option?.value || "";
      const category = v.kudo_cat_block?.kudo_cat_select?.selected_option?.value || "teamwork";
      const message = (v.kudo_msg_block?.kudo_msg_input?.value || "").trim();
      const shareSelected = (v.kudo_share_block?.kudo_share_check?.selected_options || []).length > 0;
      let meta: { channel_id?: string; origin_channel_id?: string | null } = {};
      try { meta = JSON.parse(payload.view.private_metadata || "{}"); } catch (_) { /* noop */ }

      const slackUserId = payload.user.id;

      // ---- Resolve sender (app user OR slack-only) ----
      const senderInfoRes = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      });
      const senderInfo = await senderInfoRes.json();
      const senderEmail: string | null = senderInfo?.user?.profile?.email ?? null;
      const senderName: string =
        senderInfo?.user?.profile?.display_name?.trim() ||
        senderInfo?.user?.profile?.real_name?.trim() ||
        senderInfo?.user?.real_name?.trim() ||
        senderInfo?.user?.name ||
        "Alguém";

      let senderPersonId: string | null = null;
      let senderPersonNome: string | null = null;
      if (senderEmail) {
        const { data: sp } = await supabase
          .from("people").select("id, nome").eq("email", senderEmail).eq("ativo", true).maybeSingle();
        if (sp) { senderPersonId = sp.id; senderPersonNome = sp.nome; }
      }
      const senderDisplay = senderPersonNome || senderName;

      // ---- Resolve recipient ----
      const errors: Record<string, string> = {};
      if (!toRaw) errors["kudo_to_block"] = "Selecione um colega.";
      if (!message || message.length < 3) errors["kudo_msg_block"] = "Mensagem muito curta.";
      if (message.length > 500) errors["kudo_msg_block"] = "Máximo 500 caracteres.";

      let toPersonId: string | null = null;
      let toPersonNome: string | null = null;
      let toSlackUserId: string | null = null;
      let toSlackEmail: string | null = null;
      let toSlackName: string | null = null;

      if (toRaw.startsWith("app:")) {
        const pid = toRaw.slice(4);
        const { data: tp } = await supabase.from("people").select("id, nome, ativo").eq("id", pid).maybeSingle();
        if (!tp || !tp.ativo) errors["kudo_to_block"] = "Destinatário inativo.";
        else { toPersonId = tp.id; toPersonNome = tp.nome; }
      } else if (toRaw.startsWith("slack:")) {
        toSlackUserId = toRaw.slice(6);
        const r = await fetch(`https://slack.com/api/users.info?user=${toSlackUserId}`, {
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
        });
        const d = await r.json();
        toSlackEmail = d?.user?.profile?.email ?? null;
        toSlackName =
          d?.user?.profile?.display_name?.trim() ||
          d?.user?.profile?.real_name?.trim() ||
          d?.user?.real_name?.trim() ||
          d?.user?.name ||
          "Colega";
        // Caso o usuário tenha sido cadastrado depois do modal abrir
        if (toSlackEmail) {
          const { data: tp } = await supabase
            .from("people").select("id, nome").eq("email", toSlackEmail).eq("ativo", true).maybeSingle();
          if (tp) { toPersonId = tp.id; toPersonNome = tp.nome; }
        }
      } else {
        errors["kudo_to_block"] = "Seleção inválida.";
      }

      // Mesmo usuário (app ou slack)
      if (senderPersonId && toPersonId && senderPersonId === toPersonId) {
        errors["kudo_to_block"] = "Não dá para mandar biscoito pra si mesmo 😉";
      }
      if (toSlackUserId && toSlackUserId === slackUserId) {
        errors["kudo_to_block"] = "Não dá para mandar biscoito pra si mesmo 😉";
      }

      if (Object.keys(errors).length) {
        return new Response(JSON.stringify({ response_action: "errors", errors }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const channelToPost = shareSelected && meta.channel_id ? meta.channel_id : null;
      const pendingFrom = !senderPersonId;
      const pendingTo = !toPersonId;

      const { data: kudo, error: insErr } = await supabase.from("kudos").insert({
        from_person_id: senderPersonId,
        to_person_id: toPersonId,
        from_slack_user_id: pendingFrom ? slackUserId : null,
        from_slack_email: pendingFrom ? senderEmail : null,
        from_slack_name: pendingFrom ? senderName : null,
        to_slack_user_id: pendingTo ? toSlackUserId : null,
        to_slack_email: pendingTo ? toSlackEmail : null,
        to_slack_name: pendingTo ? toSlackName : null,
        pending_from: pendingFrom,
        pending_to: pendingTo,
        message,
        category,
        slack_channel_posted: channelToPost,
      }).select().single();

      if (insErr || !kudo) {
        console.error("[biscoito_submit] insert error:", insErr);
        return new Response(
          JSON.stringify({ response_action: "errors", errors: { kudo_msg_block: "Não consegui registrar seu biscoito. Tente novamente." } }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      // Pontos apenas para lados cadastrados
      if (toPersonId) await awardPoints(supabase, toPersonId, 10, "kudo_received", kudo.id);
      if (senderPersonId) await awardPoints(supabase, senderPersonId, 2, "kudo_given", kudo.id);

      // Garante pending_people para os lados pendentes
      const ensurePending = async (slackId: string | null, email: string | null, nome: string | null) => {
        if (!slackId && !email) return;
        try {
          // procura por slack_user_id OR email em PENDENTE
          let q = supabase.from("pending_people").select("id, slack_request_count").eq("status", "PENDENTE");
          const { data: rows } = await q;
          const match = (rows || []).find((r: any) =>
            (slackId && r.slack_user_id === slackId) ||
            (email && r.email && r.email.toLowerCase() === email.toLowerCase())
          );
          if (match) {
            await supabase.from("pending_people").update({
              slack_request_count: (match.slack_request_count || 0) + 1,
              last_slack_request_at: new Date().toISOString(),
              slack_user_id: slackId || undefined,
            }).eq("id", match.id);
          } else {
            await supabase.from("pending_people").insert({
              nome: nome || email || "Usuário do Slack",
              email: email,
              papel: "COLABORADOR",
              status: "PENDENTE",
              source: "slack_biscoito",
              slack_user_id: slackId,
              slack_request_count: 1,
              last_slack_request_at: new Date().toISOString(),
              created_by: senderPersonId,
            });
          }
        } catch (e: any) {
          console.error("[biscoito_submit] ensurePending error:", e?.message || e);
        }
      };

      if (pendingFrom) await ensurePending(slackUserId, senderEmail, senderName);
      if (pendingTo) await ensurePending(toSlackUserId, toSlackEmail, toSlackName);

      // Notifica admins quando há lado pendente (best-effort)
      if (pendingFrom || pendingTo) {
        const notifyAdmins = async () => {
          try {
            const { data: adminsRaw } = await supabase
              .from("people")
              .select("email, nome, papel, is_admin")
              .eq("ativo", true)
              .or("is_admin.eq.true,papel.eq.DIRETOR");
            const seen = new Set<string>();
            const admins = (adminsRaw || []).filter((a: any) => {
              const key = (a.email || "").toLowerCase();
              if (!key || seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            const targets: Array<{ email: string; slackName: string }> = [];
            for (const lado of [
              pendingFrom ? { who: senderName, email: senderEmail, role: "enviou" } : null,
              pendingTo ? { who: toSlackName, email: toSlackEmail, role: "recebeu" } : null,
            ]) {
              if (!lado) continue;
              targets.push({ email: lado.email || "(sem email)", slackName: `${lado.who} ${lado.role}` });
            }
            const summary = targets.map(t => `• *${t.slackName}* um biscoito (${t.email})`).join("\n");
            const text = `🔔 *Novo cadastro pendente via /biscoito*\n${summary}\n\nAprove em Administração → Cadastros Pendentes para creditar os pontos retroativamente.`;
            for (const a of (admins || []) as Array<{ email: string | null }>) {
              if (!a.email) continue;
              const lookupRes = await fetch(
                `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(a.email)}`,
                { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
              );
              const lookup = await lookupRes.json();
              if (!lookup.ok || !lookup.user?.id) continue;
              const openRes = await fetch("https://slack.com/api/conversations.open", {
                method: "POST",
                headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
                body: JSON.stringify({ users: lookup.user.id }),
              });
              const open = await openRes.json();
              if (!open.ok || !open.channel?.id) continue;
              await fetch("https://slack.com/api/chat.postMessage", {
                method: "POST",
                headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
                body: JSON.stringify({ channel: open.channel.id, text }),
              });
            }
          } catch (e: any) {
            console.error("[biscoito_submit] notifyAdmins error:", e?.message || e);
          }
        };
        // @ts-ignore EdgeRuntime disponível no Supabase
        EdgeRuntime.waitUntil(notifyAdmins());
      }

      // Card do biscoito
      const toLabel = (toPersonNome || toSlackName || "Colega") + (pendingTo ? " _(cadastro pendente)_" : "");
      const fromLabel = senderDisplay + (pendingFrom ? " _(cadastro pendente)_" : "");
      const cardText = `${CATEGORY_LABEL[category] || "🍪"} *${fromLabel}* deu um biscoito para *${toLabel}*\n> ${message}`;

      const postToChannel = async (channel: string, label: string) => {
        const r = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel, text: cardText }),
        });
        const j = await r.json();
        if (!j.ok) console.log(`[biscoito_submit] ${label} post skipped: ${j.error || "unknown"} (channel=${channel})`);
      };

      const origin = meta.origin_channel_id;
      if (origin && !origin.startsWith("D")) await postToChannel(origin, "origin");
      if (channelToPost) await postToChannel(channelToPost, "share");

      // DM ao destinatário
      if (toPersonId) {
        await notifyRecipientDM(supabase, toPersonId, senderDisplay, category, message, "biscoito_submit");
      } else if (toSlackUserId) {
        try {
          const openRes = await fetch("https://slack.com/api/conversations.open", {
            method: "POST",
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ users: toSlackUserId }),
          });
          const open = await openRes.json();
          if (open.ok && open.channel?.id) {
            const catLabel = CATEGORY_LABEL[category] || "🍪";
            const txt =
              `🍪 *Você ganhou um biscoito!*\n${catLabel}\nDe: *${senderDisplay}*\n> ${message}\n\n` +
              `_Seu cadastro no app ainda está pendente. Assim que for aprovado, os pontos entram no painel de Engajamento._`;
            await fetch("https://slack.com/api/chat.postMessage", {
              method: "POST",
              headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify({ channel: open.channel.id, text: txt }),
            });
          }
        } catch (e: any) {
          console.error("[biscoito_submit] slack-only recipient DM error:", e?.message || e);
        }
      }

      if (toPersonId) {
        supabase.functions.invoke("kudos-notify-managers", { body: { kudo_id: kudo.id } })
          .catch((e: any) => console.error("[biscoito_submit] notify invoke failed", e?.message));
      }

      console.log(`[biscoito_submit] inserted kudo ${kudo.id} from=${senderPersonId ?? `slack:${slackUserId}`} to=${toPersonId ?? `slack:${toSlackUserId}`}`);
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
        const { data: upRow, error: upErr } = await supabase.from("pulse_responses").upsert(
          { run_id: runId, question_id: questionId, respondent_id: respondent.id, text_value: text },
          { onConflict: "run_id,question_id,respondent_id" }
        ).select("id").single();
        if (upErr) console.error("[pulse view_submission] upsert error:", upErr);
        else {
          await bumpResponseCount(runId, supabase);
          await awardPoints(supabase, respondent.id, 5, "pulse_response", runId);
          await completePeerPair(supabase, runId, respondent.id);
          if (upRow?.id) {
            supabase.functions.invoke("pulse-response-notify", { body: { response_id: upRow.id } })
              .catch((e: any) => console.error("[pulse_text] notify invoke failed", e?.message));
          }
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
          const { data: upRow, error: upErr } = await supabase.from("pulse_responses").upsert(
            { run_id: runId, question_id: questionId, respondent_id: respondent.id, scale_value: parseInt(value, 10), slack_message_ts: payload.message?.ts },
            { onConflict: "run_id,question_id,respondent_id" }
          ).select("id").single();
          if (upErr) {
            console.error("[pulse_answer] upsert error:", upErr);
          } else {
            await bumpResponseCount(runId, supabase);
            await awardPoints(supabase, respondent.id, 5, "pulse_response", runId);
            await completePeerPair(supabase, runId, respondent.id);
            await postEphemeralAck(payload, `✅ Resposta registrada: *${value}/5*`);
            if (upRow?.id) {
              supabase.functions.invoke("pulse-response-notify", { body: { response_id: upRow.id } })
                .catch((e: any) => console.error("[pulse_answer] notify invoke failed", e?.message));
            }
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
      if (act.action_id?.startsWith("give_kudos_open:")) {
        const [, surveyId] = act.action_id.split(":");
        const { data: survey } = await supabase
          .from("pulse_surveys")
          .select("title, kudos_categories, target_scope, target_team_id, target_person_ids")
          .eq("id", surveyId)
          .maybeSingle();

        const ALL_CATS = [
          { value: "teamwork", label: "🤝 Trabalho em equipe" },
          { value: "innovation", label: "💡 Inovação" },
          { value: "delivery", label: "🚀 Entrega" },
          { value: "leadership", label: "🏆 Liderança" },
          { value: "customer", label: "❤️ Foco no cliente" },
        ];
        const allowedCats = (survey?.kudos_categories && survey.kudos_categories.length)
          ? ALL_CATS.filter((c) => survey.kudos_categories.includes(c.value))
          : ALL_CATS;

        // Load people from same scope as the survey
        let peopleQuery = supabase.from("people").select("id, nome").eq("ativo", true).order("nome");
        if (survey?.target_scope === "team" && survey.target_team_id) {
          peopleQuery = peopleQuery.eq("sub_time", survey.target_team_id);
        } else if (survey?.target_scope === "custom" && survey.target_person_ids?.length) {
          peopleQuery = peopleQuery.in("id", survey.target_person_ids);
        }
        const { data: peopleList } = await peopleQuery;
        const peopleOpts = (peopleList || []).slice(0, 100).map((p: any) => ({
          text: { type: "plain_text", text: p.nome.slice(0, 75) },
          value: p.id,
        }));

        const r = await fetch("https://slack.com/api/views.open", {
          method: "POST",
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            trigger_id: payload.trigger_id,
            view: {
              type: "modal",
              callback_id: `kudos_submit:${surveyId}`,
              title: { type: "plain_text", text: "Dar kudos" },
              submit: { type: "plain_text", text: "Enviar" },
              close: { type: "plain_text", text: "Cancelar" },
              blocks: [
                {
                  type: "input",
                  block_id: "kudo_to_block",
                  label: { type: "plain_text", text: "Para quem?" },
                  element: {
                    type: "static_select",
                    action_id: "kudo_to_select",
                    placeholder: { type: "plain_text", text: "Selecione um colega" },
                    options: peopleOpts,
                  },
                },
                {
                  type: "input",
                  block_id: "kudo_cat_block",
                  label: { type: "plain_text", text: "Categoria" },
                  element: {
                    type: "static_select",
                    action_id: "kudo_cat_select",
                    placeholder: { type: "plain_text", text: "Escolha uma categoria" },
                    options: allowedCats.map((c) => ({
                      text: { type: "plain_text", text: c.label },
                      value: c.value,
                    })),
                  },
                },
                {
                  type: "input",
                  block_id: "kudo_msg_block",
                  label: { type: "plain_text", text: "Mensagem" },
                  element: {
                    type: "plain_text_input",
                    action_id: "kudo_msg_input",
                    multiline: true,
                    max_length: 500,
                    placeholder: { type: "plain_text", text: "O que essa pessoa fez de incrível?" },
                  },
                },
              ],
            },
          }),
        });
        const d = await r.json();
        if (!d.ok) console.error("[give_kudos_open] views.open error:", d);
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
