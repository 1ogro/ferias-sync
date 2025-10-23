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
    console.log("Slack interaction payload:", payload);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different action types
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
