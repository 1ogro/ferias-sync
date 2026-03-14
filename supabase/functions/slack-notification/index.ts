import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
const SLACK_CHANNEL = Deno.env.get("SLACK_CHANNEL_APPROVALS");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SlackNotificationRequest {
  type: 'NEW_REQUEST' | 'APPROVAL' | 'REJECTION' | 'REQUEST_INFO' | 'PERSON_APPROVED' | 'PERSON_REJECTED' | 'INVITE_ACCEPTED' | 'NEW_PENDING_PERSON';
  requestId?: string;
  requesterName?: string;
  requestType?: string;
  startDate?: string;
  endDate?: string;
  approverEmail?: string;
  comment?: string;
  targetPersonId?: string;
  personName?: string;
  personEmail?: string;
  directorName?: string;
  rejectionReason?: string;
  managerName?: string;
}

const TIPO_EMOJI = {
  'FERIAS': '🏖️',
  'DAY_OFF': '🎂',
  'LICENCA_MATERNIDADE': '👶',
  'LICENCA_MEDICA': '🏥',
};

// Map notification types to preference columns
function getPreferenceColumn(type: string): string | null {
  if (['NEW_REQUEST', 'APPROVAL', 'REJECTION', 'REQUEST_INFO'].includes(type)) {
    return 'request_updates_slack';
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: SlackNotificationRequest = await req.json();
    console.log("Slack notification payload:", payload);

    // Check user preferences if targetPersonId is provided
    if (payload.targetPersonId) {
      const prefColumn = getPreferenceColumn(payload.type);
      if (prefColumn) {
        try {
          const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
          );
          const { data: prefs } = await supabaseAdmin
            .from("notification_preferences")
            .select(prefColumn)
            .eq("person_id", payload.targetPersonId)
            .maybeSingle();

          if (prefs && prefs[prefColumn] === false) {
            console.log(`Slack notification skipped: user ${payload.targetPersonId} disabled ${prefColumn}`);
            return new Response(JSON.stringify({ success: true, skipped: true, reason: 'user_preference' }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (prefError) {
          console.warn("Could not check notification preferences, sending anyway:", prefError);
        }
      }
    }

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
    } else if (payload.type === 'PERSON_APPROVED') {
      text = `Colaborador Aprovado`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*✅ Colaborador Aprovado*\n👤 *${payload.personName}* (${payload.personEmail})\n🔑 Aprovado por: ${payload.directorName}`,
          },
        },
      ];
    } else if (payload.type === 'PERSON_REJECTED') {
      text = `Colaborador Rejeitado`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*❌ Colaborador Rejeitado*\n👤 *${payload.personName}* (${payload.personEmail})\n🔑 Rejeitado por: ${payload.directorName}${payload.rejectionReason ? `\n💬 Motivo: ${payload.rejectionReason}` : ''}`,
          },
        },
      ];
    } else if (payload.type === 'INVITE_ACCEPTED') {
      text = `Convite Aceito`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*🎉 Convite Aceito*\n👤 *${payload.personName}* (${payload.personEmail}) aceitou o convite e criou sua conta no sistema.`,
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
