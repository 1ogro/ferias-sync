import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
const SLACK_CHANNEL = Deno.env.get("SLACK_CHANNEL_APPROVALS");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SlackNotificationRequest {
  type: 'NEW_REQUEST' | 'APPROVAL' | 'REJECTION' | 'REQUEST_INFO';
  requestId: string;
  requesterName: string;
  requestType: string;
  startDate: string;
  endDate: string;
  approverEmail?: string;
  comment?: string;
}

const TIPO_EMOJI = {
  'FERIAS': '🏖️',
  'DAY_OFF': '🎂',
  'LICENCA_MATERNIDADE': '👶',
  'LICENCA_MEDICA': '🏥',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: SlackNotificationRequest = await req.json();
    console.log("Slack notification payload:", payload);

    // Get Slack user ID from email (if provided)
    let slackUserId = null;
    if (payload.approverEmail) {
      const userResponse = await fetch("https://slack.com/api/users.lookupByEmail", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `email=${encodeURIComponent(payload.approverEmail)}`,
      });
      const userData = await userResponse.json();
      if (userData.ok) {
        slackUserId = userData.user.id;
      }
    }

    const emoji = TIPO_EMOJI[payload.requestType as keyof typeof TIPO_EMOJI] || '📝';
    
    let blocks: any[] = [];
    let text = '';

    if (payload.type === 'NEW_REQUEST') {
      text = `Nova Solicitação de ${payload.requestType}`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${emoji} Nova Solicitação: ${payload.requestType}*\n👤 *${payload.requesterName}*\n📅 ${payload.startDate} até ${payload.endDate}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "✅ Aprovar" },
              style: "primary",
              action_id: "approve_request",
              value: payload.requestId,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "❌ Rejeitar" },
              style: "danger",
              action_id: "reject_request",
              value: payload.requestId,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "📋 Solicitar Info" },
              action_id: "request_info",
              value: payload.requestId,
            },
          ],
        },
      ];
    } else if (payload.type === 'APPROVAL') {
      text = `Solicitação Aprovada`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*✅ Solicitação Aprovada*\n👤 ${payload.requesterName}\n📅 ${payload.startDate} até ${payload.endDate}${payload.comment ? `\n💬 ${payload.comment}` : ''}`,
          },
        },
      ];
    } else if (payload.type === 'REJECTION') {
      text = `Solicitação Rejeitada`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*❌ Solicitação Rejeitada*\n👤 ${payload.requesterName}\n📅 ${payload.startDate} até ${payload.endDate}${payload.comment ? `\n💬 ${payload.comment}` : ''}`,
          },
        },
      ];
    } else if (payload.type === 'REQUEST_INFO') {
      text = `Informações Adicionais Solicitadas`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*📋 Informações Adicionais Solicitadas*\n👤 ${payload.requesterName}\n📅 ${payload.startDate} até ${payload.endDate}${payload.comment ? `\n💬 ${payload.comment}` : ''}`,
          },
        },
      ];
    }

    // Send message to channel or DM
    const target = slackUserId || SLACK_CHANNEL;
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: target,
        text,
        blocks,
      }),
    });

    const result = await response.json();
    console.log("Slack API response:", result);

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }

    return new Response(
      JSON.stringify({ success: true, message_ts: result.ts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in slack-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
