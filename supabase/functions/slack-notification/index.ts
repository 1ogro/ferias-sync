import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
const SLACK_CHANNEL = Deno.env.get("SLACK_CHANNEL_APPROVALS");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SlackNotificationRequest {
  type: 'NEW_REQUEST' | 'APPROVAL' | 'REJECTION' | 'REQUEST_INFO' | 'PERSON_APPROVED' | 'PERSON_REJECTED' | 'INVITE_ACCEPTED' | 'NEW_PENDING_PERSON' | 'PAYMENT_DAY_CHANGE_REQUEST' | 'PAYMENT_DAY_CHANGE_DECISION' | 'USER_LOGIN' | 'USER_SIGNUP' | 'USER_PASSWORD_RESET_REQUEST' | 'USER_FIGMA_LOGIN' | 'PROFILE_UPDATE' | 'CONTRACT_SETUP' | 'MEDICAL_LEAVE_CREATED' | 'MEDICAL_LEAVE_ENDED';
  approved?: boolean;
  notes?: string | null;
  requestId?: string;
  requesterName?: string;
  requestType?: string;
  startDate?: string;
  endDate?: string;
  approverEmail?: string;
  approverName?: string;
  recipientEmail?: string;
  recipientName?: string;
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
  diagnose?: boolean;
}

type LookupResult = {
  slackUserId: string | null;
  method: 'email_lookup_ok' | 'name_lookup_ok' | 'not_found' | 'no_input';
  error?: string;
};

async function lookupSlackUser(email?: string, name?: string): Promise<LookupResult> {
  if (!email && !name) return { slackUserId: null, method: 'no_input' };

  if (email) {
    try {
      const res = await fetch(
        `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
        { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
      );
      const data = await res.json();
      if (data.ok && data.user?.id) {
        return { slackUserId: data.user.id, method: 'email_lookup_ok' };
      }
      console.warn(`users.lookupByEmail failed for ${email}: ${data.error}`);
      if (!name) return { slackUserId: null, method: 'not_found', error: data.error };
    } catch (err: any) {
      console.error("users.lookupByEmail threw:", err?.message);
    }
  }

  if (name) {
    const target = name.trim().toLowerCase();
    let cursor = "";
    do {
      const url = `https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } });
      const data = await res.json();
      if (!data.ok) {
        console.error("users.list error:", data.error);
        return { slackUserId: null, method: 'not_found', error: data.error };
      }
      const match = data.members?.find((u: any) => {
        const candidates = [u.real_name, u.profile?.display_name, u.profile?.real_name, u.name]
          .filter(Boolean)
          .map((s: string) => s.toLowerCase());
        return candidates.includes(target);
      });
      if (match) return { slackUserId: match.id, method: 'name_lookup_ok' };
      cursor = data.response_metadata?.next_cursor || "";
    } while (cursor);
  }

  return { slackUserId: null, method: 'not_found' };
}

const TIPO_EMOJI = {
  'FERIAS': '🏖️',
  'DAY_OFF': '🎂',
  'DAYOFF': '🎂',
  'LICENCA_MATERNIDADE': '👶',
  'LICENCA_MEDICA': '🏥',
};

const DM_TYPES = new Set(['NEW_REQUEST', 'APPROVAL', 'REJECTION', 'REQUEST_INFO']);

function getPreferenceColumn(type: string): string | null {
  if (DM_TYPES.has(type)) return 'request_updates_slack';
  return null;
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let payload: SlackNotificationRequest | null = null;
  try {
    payload = await req.json();
    console.log("Slack notification payload:", payload);

    const url = new URL(req.url);
    const diagnose = payload!.diagnose === true || url.searchParams.get('diagnose') === 'true';

    const lookupEmail = payload!.recipientEmail || payload!.approverEmail;
    const lookupName = payload!.recipientName || payload!.approverName;

    // Diagnose mode: resolve only, never send
    if (diagnose) {
      const result = await lookupSlackUser(lookupEmail, lookupName);
      return new Response(
        JSON.stringify({ success: true, diagnose: true, ...result, lookupEmail, lookupName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Respect user preference (only when targetPersonId provided)
    if (payload!.targetPersonId) {
      const prefColumn = getPreferenceColumn(payload!.type);
      if (prefColumn) {
        try {
          const supabaseAdmin = getSupabaseAdmin();
          const { data: prefs } = await supabaseAdmin
            .from("notification_preferences")
            .select(prefColumn)
            .eq("person_id", payload!.targetPersonId)
            .maybeSingle();

          if (prefs && (prefs as any)[prefColumn] === false) {
            console.log(`Slack notification skipped: user ${payload!.targetPersonId} disabled ${prefColumn}`);
            return new Response(JSON.stringify({ success: true, skipped: true, reason: 'user_preference' }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (prefError) {
          console.warn("Could not check notification preferences, sending anyway:", prefError);
        }
      }
    }

    const lookup = await lookupSlackUser(lookupEmail, lookupName);
    console.log("Slack lookup result:", lookup);

    const emoji = TIPO_EMOJI[payload!.requestType as keyof typeof TIPO_EMOJI] || '📝';
    let blocks: any[] = [];
    let text = '';

    if (payload!.type === 'NEW_REQUEST') {
      text = `Nova Solicitação de ${payload!.requestType}`;
      blocks = [
        { type: "section", text: { type: "mrkdwn", text: `*${emoji} Nova Solicitação: ${payload!.requestType}*\n👤 *${payload!.requesterName}*\n📅 ${payload!.startDate} até ${payload!.endDate}` } },
        { type: "actions", elements: [
          { type: "button", text: { type: "plain_text", text: "✅ Aprovar" }, style: "primary", action_id: "approve_request", value: payload!.requestId },
          { type: "button", text: { type: "plain_text", text: "❌ Rejeitar" }, style: "danger", action_id: "reject_request", value: payload!.requestId },
          { type: "button", text: { type: "plain_text", text: "📋 Solicitar Info" }, action_id: "request_info", value: payload!.requestId },
        ] },
      ];
    } else if (payload!.type === 'APPROVAL') {
      text = `Solicitação Aprovada`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*✅ Solicitação Aprovada*\n👤 ${payload!.requesterName}\n📅 ${payload!.startDate} até ${payload!.endDate}${payload!.comment ? `\n💬 ${payload!.comment}` : ''}` } }];
    } else if (payload!.type === 'REJECTION') {
      text = `Solicitação Rejeitada`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*❌ Solicitação Rejeitada*\n👤 ${payload!.requesterName}\n📅 ${payload!.startDate} até ${payload!.endDate}${payload!.comment ? `\n💬 ${payload!.comment}` : ''}` } }];
    } else if (payload!.type === 'REQUEST_INFO') {
      text = `Informações Adicionais Solicitadas`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*📋 Informações Adicionais Solicitadas*\n👤 ${payload!.requesterName}\n📅 ${payload!.startDate} até ${payload!.endDate}${payload!.comment ? `\n💬 ${payload!.comment}` : ''}` } }];
    } else if (payload!.type === 'PERSON_APPROVED') {
      text = `Colaborador Aprovado`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*✅ Colaborador Aprovado*\n👤 *${payload!.personName}* (${payload!.personEmail})\n🔑 Aprovado por: ${payload!.directorName}` } }];
    } else if (payload!.type === 'PERSON_REJECTED') {
      text = `Colaborador Rejeitado`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*❌ Colaborador Rejeitado*\n👤 *${payload!.personName}* (${payload!.personEmail})\n🔑 Rejeitado por: ${payload!.directorName}${payload!.rejectionReason ? `\n💬 Motivo: ${payload!.rejectionReason}` : ''}` } }];
    } else if (payload!.type === 'INVITE_ACCEPTED') {
      text = `Convite Aceito`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*🎉 Convite Aceito*\n👤 *${payload!.personName}* (${payload!.personEmail}) aceitou o convite e criou sua conta no sistema.` } }];
    } else if (payload!.type === 'NEW_PENDING_PERSON') {
      text = `Novo Cadastro Pendente`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*📋 Novo Cadastro Pendente*\n👤 *${payload!.managerName}* submeteu o cadastro de *${payload!.personName}* (${payload!.personEmail}) para aprovação.` } }];

      // Fan-out: DM redundante a cada admin/diretor
      try {
        const supabaseAdmin = getSupabaseAdmin();
        const { data: admins } = await supabaseAdmin
          .from('people')
          .select('id, nome, email')
          .or('papel.eq.DIRETOR,is_admin.eq.true')
          .eq('ativo', true);

        const fanout: any[] = [];
        for (const a of admins ?? []) {
          if (!a.email) { fanout.push({ id: a.id, ok: false, error: 'no_email' }); continue; }
          const r = await lookupSlackUser(a.email, a.nome);
          if (!r.slackUserId) {
            fanout.push({ id: a.id, email: a.email, ok: false, error: 'no_slack_linked' });
            continue;
          }
          const dmRes = await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ channel: r.slackUserId, text, blocks }),
          });
          const dmJson = await dmRes.json();
          fanout.push({ id: a.id, email: a.email, ok: !!dmJson.ok, error: dmJson.error, slack_user_id: r.slackUserId });
        }

        await supabaseAdmin.from('audit_logs').insert({
          entidade: 'slack_notification',
          entidade_id: payload!.targetPersonId || 'n/a',
          acao: 'NEW_PENDING_PERSON_FANOUT',
          actor_id: null,
          payload: { fanout, missing_slack: fanout.filter((f) => f.error === 'no_slack_linked').map((f) => f.email) },
        });
      } catch (fanErr) {
        console.warn('NEW_PENDING_PERSON fanout failed:', fanErr);
      }
    } else if (payload!.type === 'PAYMENT_DAY_CHANGE_REQUEST') {
      text = `Solicitação de Alteração de Dia de Pagamento`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*💰 Solicitação de Alteração de Dia de Pagamento*\n👤 *${payload!.requesterName}*\n📅 Dia atual: ${payload!.currentPaymentDay} → Dia desejado: ${payload!.desiredPaymentDay}` } }];
    } else if (payload!.type === 'USER_LOGIN') {
      text = `Login realizado`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*🔐 Login*\n${payload!.personName ? `👤 *${payload!.personName}*` : ''} (${payload!.email})` } }];
    } else if (payload!.type === 'USER_SIGNUP') {
      text = `Autocadastro realizado`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*📝 Autocadastro*\n${payload!.personName ? `👤 *${payload!.personName}*` : ''} (${payload!.email}) se cadastrou no sistema` } }];
    } else if (payload!.type === 'USER_PASSWORD_RESET_REQUEST') {
      text = `Reset de senha solicitado`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*🔑 Reset de Senha Solicitado*\n📧 ${payload!.email} solicitou recuperação de senha` } }];
    } else if (payload!.type === 'USER_FIGMA_LOGIN') {
      text = `Login via Figma`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*🎨 Login Figma*\n${payload!.personName ? `👤 *${payload!.personName}*` : ''} (${payload!.email || 'email não disponível'})` } }];
    } else if (payload!.type === 'PROFILE_UPDATE') {
      text = `Perfil atualizado`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*👤 Perfil Atualizado*\n👤 *${payload!.personName}* (${payload!.personEmail}) alterou seus dados pessoais${payload!.changedFields ? `\n📝 Campos: ${payload!.changedFields}` : ''}` } }];
    } else if (payload!.type === 'CONTRACT_SETUP') {
      text = `Contrato configurado`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*📋 Contrato Configurado*\n👤 *${payload!.personName}* configurou contrato ${payload!.contractModel}, data: ${payload!.contractDate}` } }];
    } else if (payload!.type === 'MEDICAL_LEAVE_CREATED') {
      text = `Licença Médica Registrada`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*🏥 Licença Médica Registrada*\n👤 *${payload!.personName}*\n📅 ${payload!.startDate} até ${payload!.endDate}${payload!.justification ? `\n💬 ${payload!.justification}` : ''}${payload!.affectsCapacity ? '\n⚠️ Afeta capacidade do time' : ''}` } }];
    } else if (payload!.type === 'MEDICAL_LEAVE_ENDED') {
      text = `Licença Médica Encerrada`;
      blocks = [{ type: "section", text: { type: "mrkdwn", text: `*✅ Licença Médica Encerrada*\n👤 *${payload!.personName}*\n📅 ${payload!.startDate} até ${payload!.endDate}` } }];
    }

    // Decide delivery
    let channel: string | undefined;
    let deliveryMode: 'dm' | 'channel_fallback' | 'channel' = 'channel';

    if (lookup.slackUserId) {
      channel = lookup.slackUserId;
      deliveryMode = 'dm';
    } else if (DM_TYPES.has(payload!.type) && lookupEmail && SLACK_CHANNEL) {
      // DM was expected but failed — surface the failure in the channel
      channel = SLACK_CHANNEL;
      deliveryMode = 'channel_fallback';
      const warning = `⚠️ Não consegui enviar DM para \`${lookupEmail}\`${lookupName ? ` (${lookupName})` : ''}. Motivo: \`${lookup.method}${lookup.error ? ':' + lookup.error : ''}\`. Verifique se o usuário existe no Slack com este email ou se o bot tem os escopos \`users:read\` e \`users:read.email\`.`;
      blocks = [
        { type: "section", text: { type: "mrkdwn", text: warning } },
        { type: "divider" },
        ...blocks,
      ];
    } else if (SLACK_CHANNEL) {
      channel = SLACK_CHANNEL;
      deliveryMode = 'channel';
    }

    let slackResult: any = null;
    if (channel) {
      const response = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel, text, blocks }),
      });
      slackResult = await response.json();
      console.log("Slack API response:", slackResult, "mode:", deliveryMode);
    } else {
      console.warn("No channel resolved and SLACK_CHANNEL_APPROVALS not set — message dropped");
    }

    // Audit log (best-effort, never throws)
    try {
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.from('audit_logs').insert({
        entidade: 'slack_notification',
        entidade_id: payload!.requestId || payload!.targetPersonId || 'n/a',
        acao: payload!.type,
        actor_id: null,
        payload: {
          deliveryMode,
          lookupEmail,
          lookupName,
          lookupMethod: lookup.method,
          lookupError: lookup.error,
          slackUserId: lookup.slackUserId,
          slackOk: slackResult?.ok ?? false,
          slackError: slackResult?.error ?? null,
          message_ts: slackResult?.ts ?? null,
        },
      });
    } catch (auditErr) {
      console.warn("Failed to write audit_log for slack_notification:", auditErr);
    }

    if (slackResult && !slackResult.ok) {
      throw new Error(`Slack API error: ${slackResult.error}`);
    }

    return new Response(
      JSON.stringify({ success: true, deliveryMode, lookupMethod: lookup.method, message_ts: slackResult?.ts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in slack-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
