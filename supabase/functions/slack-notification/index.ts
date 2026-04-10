import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
const SLACK_CHANNEL = Deno.env.get("SLACK_CHANNEL_APPROVALS");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SlackNotificationRequest {
  type: 'NEW_REQUEST' | 'APPROVAL' | 'REJECTION' | 'REQUEST_INFO' | 'PERSON_APPROVED' | 'PERSON_REJECTED' | 'INVITE_ACCEPTED' | 'NEW_PENDING_PERSON' | 'PAYMENT_DAY_CHANGE_REQUEST' | 'USER_LOGIN' | 'USER_SIGNUP' | 'USER_PASSWORD_RESET_REQUEST' | 'USER_FIGMA_LOGIN' | 'PROFILE_UPDATE' | 'CONTRACT_SETUP' | 'MEDICAL_LEAVE_CREATED' | 'MEDICAL_LEAVE_ENDED';
  requestId?: string;
  requesterName?: string;
  requestType?: string;
  startDate?: string;
  endDate?: string;
  approverEmail?: string;
  approverName?: string;
  comment?: string;
  targetPersonId?: string;
  personName?: string;
  personEmail?: string;
  directorName?: string;
  rejectionReason?: string;
  managerName?: string;
  currentPaymentDay?: number;
  desiredPaymentDay?: number;
  email?: string;
  changedFields?: string;
  contractModel?: string;
  contractDate?: string;
  affectsCapacity?: boolean;
  justification?: string;
}

async function findSlackUserByName(personName: string): Promise<string | null> {
  let cursor = "";
  do {
    const url = `https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("users.list error:", data.error);
      return null;
    }
    const nameLower = personName.toLowerCase();
    const match = data.members?.find(
      (u: any) =>
        u.real_name?.toLowerCase()?.includes(nameLower) ||
        nameLower.includes(u.real_name?.toLowerCase() || "___") ||
        u.profile?.display_name?.toLowerCase()?.includes(nameLower) ||
        nameLower.includes(u.profile?.display_name?.toLowerCase() || "___") ||
        u.name?.toLowerCase() === nameLower
    );
    if (match) return match.id;
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);
  return null;
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

    // Get Slack user ID from email (if provided), with name fallback
    let slackUserId = null;
    if (payload.approverEmail) {
      const userResponse = await fetch(
        `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(payload.approverEmail)}`,
        {
          headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}` },
        }
      );
      const userData = await userResponse.json();
      if (userData.ok) {
        slackUserId = userData.user.id;
      } else if (payload.approverName) {
        console.log(`Email lookup failed for ${payload.approverEmail}, trying name lookup for "${payload.approverName}"...`);
        slackUserId = await findSlackUserByName(payload.approverName);
        if (slackUserId) {
          console.log(`Found Slack user by name "${payload.approverName}": ${slackUserId}`);
        }
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
    } else if (payload.type === 'NEW_PENDING_PERSON') {
      text = `Novo Cadastro Pendente`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*📋 Novo Cadastro Pendente*\n👤 *${payload.managerName}* submeteu o cadastro de *${payload.personName}* (${payload.personEmail}) para aprovação.`,
          },
        },
      ];
    } else if (payload.type === 'PAYMENT_DAY_CHANGE_REQUEST') {
      text = `Solicitação de Alteração de Dia de Pagamento`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*💰 Solicitação de Alteração de Dia de Pagamento*\n👤 *${payload.requesterName}*\n📅 Dia atual: ${payload.currentPaymentDay} → Dia desejado: ${payload.desiredPaymentDay}`,
          },
        },
      ];
    } else if (payload.type === 'USER_LOGIN') {
      text = `Login realizado`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*🔐 Login*\n${payload.personName ? `👤 *${payload.personName}*` : ''} (${payload.email})`,
          },
        },
      ];
    } else if (payload.type === 'USER_SIGNUP') {
      text = `Autocadastro realizado`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*📝 Autocadastro*\n${payload.personName ? `👤 *${payload.personName}*` : ''} (${payload.email}) se cadastrou no sistema`,
          },
        },
      ];
    } else if (payload.type === 'USER_PASSWORD_RESET_REQUEST') {
      text = `Reset de senha solicitado`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*🔑 Reset de Senha Solicitado*\n📧 ${payload.email} solicitou recuperação de senha`,
          },
        },
      ];
    } else if (payload.type === 'USER_FIGMA_LOGIN') {
      text = `Login via Figma`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*🎨 Login Figma*\n${payload.personName ? `👤 *${payload.personName}*` : ''} (${payload.email || 'email não disponível'})`,
          },
        },
      ];
    } else if (payload.type === 'PROFILE_UPDATE') {
      text = `Perfil atualizado`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*👤 Perfil Atualizado*\n👤 *${payload.personName}* (${payload.personEmail}) alterou seus dados pessoais${payload.changedFields ? `\n📝 Campos: ${payload.changedFields}` : ''}`,
          },
        },
      ];
    } else if (payload.type === 'CONTRACT_SETUP') {
      text = `Contrato configurado`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*📋 Contrato Configurado*\n👤 *${payload.personName}* configurou contrato ${payload.contractModel}, data: ${payload.contractDate}`,
          },
        },
      ];
    } else if (payload.type === 'MEDICAL_LEAVE_CREATED') {
      text = `Licença Médica Registrada`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*🏥 Licença Médica Registrada*\n👤 *${payload.personName}*\n📅 ${payload.startDate} até ${payload.endDate}${payload.justification ? `\n💬 ${payload.justification}` : ''}${payload.affectsCapacity ? '\n⚠️ Afeta capacidade do time' : ''}`,
          },
        },
      ];
    } else if (payload.type === 'MEDICAL_LEAVE_ENDED') {
      text = `Licença Médica Encerrada`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*✅ Licença Médica Encerrada*\n👤 *${payload.personName}*\n📅 ${payload.startDate} até ${payload.endDate}`,
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
