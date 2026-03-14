import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: 'NEW_REQUEST' | 'APPROVAL_MANAGER' | 'APPROVAL_FINAL' | 'REJECTION' | 'REQUEST_INFO' | 'PAYMENT_DAY_CHANGE_REQUEST' | 'INVITE_ACCEPTED' | 'NEW_PENDING_PERSON';
  to?: string;
  requesterName: string;
  requestType?: string;
  startDate?: string;
  endDate?: string;
  approverName?: string;
  comment?: string;
  expectedDeliveryDate?: string;
  totalDays?: number;
  hasExtension?: boolean;
  extensionDays?: number;
  extensionJustification?: string;
  currentPaymentDay?: number;
  desiredPaymentDay?: number;
  targetPersonId?: string;
  collaboratorName?: string;
  collaboratorEmail?: string;
  managerName?: string;
}

// Map notification types to preference columns
function getPreferenceColumn(type: string): string | null {
  if (['NEW_REQUEST', 'APPROVAL_MANAGER', 'APPROVAL_FINAL', 'REJECTION', 'REQUEST_INFO'].includes(type)) {
    return 'request_updates_email';
  }
  if (type === 'PAYMENT_DAY_CHANGE_REQUEST' || type === 'INVITE_ACCEPTED' || type === 'NEW_PENDING_PERSON') {
    return 'admin_actions_email';
  }
  return null;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const notification: NotificationRequest = await req.json();
    console.log("Processing notification:", notification.type, "to:", notification.to);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // For NEW_PENDING_PERSON, find all directors and send to each
    if (notification.type === 'NEW_PENDING_PERSON') {
      const { data: directors } = await supabaseAdmin
        .from("people")
        .select("id, email, nome")
        .or("papel.eq.DIRETOR,is_admin.eq.true")
        .eq("ativo", true);

      if (!directors || directors.length === 0) {
        console.log("No directors found to notify");
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_directors' }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const emailContent = generateEmailContent(notification);
      const results = [];

      for (const director of directors) {
        // Check preferences
        const { data: prefs } = await supabaseAdmin
          .from("notification_preferences")
          .select("admin_actions_email")
          .eq("person_id", director.id)
          .maybeSingle();

        if (prefs && prefs.admin_actions_email === false) {
          console.log(`Email skipped for director ${director.id}: preference disabled`);
          continue;
        }

        try {
          const emailResponse = await resend.emails.send({
            from: "Sistema de Férias <onboarding@resend.dev>",
            to: [director.email],
            subject: emailContent.subject,
            html: emailContent.html,
          });
          results.push({ director: director.id, success: true, id: emailResponse.data?.id });
        } catch (emailErr: any) {
          console.error(`Failed to send to director ${director.id}:`, emailErr);
          results.push({ director: director.id, success: false, error: emailErr.message });
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Check user preferences if targetPersonId is provided
    if (notification.targetPersonId) {
      const prefColumn = getPreferenceColumn(notification.type);
      if (prefColumn) {
        try {
          const { data: prefs } = await supabaseAdmin
            .from("notification_preferences")
            .select(prefColumn)
            .eq("person_id", notification.targetPersonId)
            .maybeSingle();

          if (prefs && prefs[prefColumn] === false) {
            console.log(`Email notification skipped: user ${notification.targetPersonId} disabled ${prefColumn}`);
            return new Response(JSON.stringify({ success: true, skipped: true, reason: 'user_preference' }), {
              status: 200,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }
        } catch (prefError) {
          console.warn("Could not check notification preferences, sending anyway:", prefError);
        }
      }
    }

    const emailContent = generateEmailContent(notification);

    const emailResponse = await resend.emails.send({
      from: "Sistema de Férias <onboarding@resend.dev>",
      to: [notification.to!],
      subject: emailContent.subject,
      html: emailContent.html,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, id: emailResponse.data?.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending notification email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

function generateEmailContent(notification: NotificationRequest): { subject: string; html: string } {
  const typeLabels: Record<string, string> = {
    FERIAS: "Férias",
    DAYOFF: "Day Off",
    LICENCA_MEDICA: "Licença Médica",
    LICENCA_MATERNIDADE: "Licença Maternidade",
  };

  const requestTypeLabel = typeLabels[notification.requestType || ''] || notification.requestType || '';
  const dateRange = notification.startDate && notification.endDate
    ? `${notification.startDate} até ${notification.endDate}`
    : "";
  
  const isMaternityLeave = notification.requestType === 'LICENCA_MATERNIDADE';

  switch (notification.type) {
    case 'NEW_REQUEST':
      return {
        subject: `Nova solicitação de ${requestTypeLabel} - ${notification.requesterName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">${isMaternityLeave ? '👶 ' : ''}Nova Solicitação</h2>
            <p>Olá,</p>
            <p><strong>${notification.requesterName}</strong> criou uma nova solicitação de <strong>${requestTypeLabel}</strong>.</p>
            ${dateRange ? `<p><strong>Período:</strong> ${dateRange}</p>` : ''}
            ${isMaternityLeave && notification.expectedDeliveryDate ? `
              <p style="background-color: #fdf2f8; padding: 10px; border-left: 3px solid #ec4899;">
                <strong>Data Prevista do Parto:</strong> ${notification.expectedDeliveryDate}<br/>
                <strong>Duração:</strong> ${notification.totalDays || 120} dias
                ${notification.hasExtension ? `
                  <br/><strong>⚠️ Extensão Contratual:</strong> ${notification.extensionDays} dias
                  <br/><strong>Justificativa:</strong> ${notification.extensionJustification}
                ` : ''}
              </p>
            ` : ''}
            <p>Acesse o sistema para revisar e aprovar a solicitação.</p>
            <br/>
            <a href="${Deno.env.get('SUPABASE_URL')}" 
               style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Acessar Sistema
            </a>
            <br/><br/>
            <p style="color: #666; font-size: 12px;">Este é um email automático, por favor não responda.</p>
          </div>
        `,
      };

    case 'APPROVAL_MANAGER':
      return {
        subject: `Sua solicitação foi aprovada pelo gestor`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">✅ Aprovação do Gestor</h2>
            <p>Olá <strong>${notification.requesterName}</strong>,</p>
            <p>Sua solicitação de <strong>${requestTypeLabel}</strong> foi aprovada pelo seu gestor.</p>
            ${dateRange ? `<p><strong>Período:</strong> ${dateRange}</p>` : ''}
            ${notification.comment ? `<p><strong>Comentário:</strong> ${notification.comment}</p>` : ''}
            <p>A solicitação agora aguarda análise da diretoria.</p>
            <br/>
            <p style="color: #666; font-size: 12px;">Este é um email automático, por favor não responda.</p>
          </div>
        `,
      };

    case 'APPROVAL_FINAL':
      return {
        subject: `🎉 Sua solicitação foi aprovada!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">🎉 Aprovação Final</h2>
            <p>Olá <strong>${notification.requesterName}</strong>,</p>
            <p>Ótimas notícias! Sua solicitação de <strong>${requestTypeLabel}</strong> foi <strong>aprovada</strong>.</p>
            ${dateRange ? `<p><strong>Período aprovado:</strong> ${dateRange}</p>` : ''}
            ${notification.comment ? `<p><strong>Comentário:</strong> ${notification.comment}</p>` : ''}
            <br/>
            <a href="${Deno.env.get('SUPABASE_URL')}" 
               style="background-color: #16a34a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Ver Detalhes
            </a>
            <br/><br/>
            <p style="color: #666; font-size: 12px;">Este é um email automático, por favor não responda.</p>
          </div>
        `,
      };

    case 'REJECTION':
      return {
        subject: `Sua solicitação foi recusada`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">❌ Solicitação Recusada</h2>
            <p>Olá <strong>${notification.requesterName}</strong>,</p>
            <p>Informamos que sua solicitação de <strong>${requestTypeLabel}</strong> foi recusada.</p>
            ${dateRange ? `<p><strong>Período:</strong> ${dateRange}</p>` : ''}
            ${notification.approverName ? `<p><strong>Avaliado por:</strong> ${notification.approverName}</p>` : ''}
            ${notification.comment ? `<p><strong>Motivo:</strong> ${notification.comment}</p>` : ''}
            <p>Entre em contato com seu gestor para mais informações.</p>
            <br/>
            <p style="color: #666; font-size: 12px;">Este é um email automático, por favor não responda.</p>
          </div>
        `,
      };

    case 'REQUEST_INFO':
      return {
        subject: `Informações adicionais necessárias`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ea580c;">📋 Informações Adicionais Necessárias</h2>
            <p>Olá <strong>${notification.requesterName}</strong>,</p>
            <p>Sua solicitação de <strong>${requestTypeLabel}</strong> precisa de informações adicionais.</p>
            ${dateRange ? `<p><strong>Período:</strong> ${dateRange}</p>` : ''}
            ${notification.approverName ? `<p><strong>Solicitado por:</strong> ${notification.approverName}</p>` : ''}
            ${notification.comment ? `<p><strong>Informações necessárias:</strong> ${notification.comment}</p>` : ''}
            <p>Por favor, acesse o sistema e forneça as informações solicitadas.</p>
            <br/>
            <a href="${Deno.env.get('SUPABASE_URL')}" 
               style="background-color: #ea580c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Responder
            </a>
            <br/><br/>
            <p style="color: #666; font-size: 12px;">Este é um email automático, por favor não responda.</p>
          </div>
        `,
      };

    case 'PAYMENT_DAY_CHANGE_REQUEST':
      return {
        subject: `Solicitação de alteração de dia de pagamento - ${notification.requesterName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">💰 Solicitação de Alteração de Dia de Pagamento</h2>
            <p>Olá,</p>
            <p>O colaborador <strong>${notification.requesterName}</strong> solicita a alteração do dia de pagamento:</p>
            <div style="background-color: #f0f9ff; padding: 15px; border-left: 3px solid #2563eb; margin: 15px 0;">
              <p style="margin: 5px 0;"><strong>Dia atual:</strong> ${notification.currentPaymentDay || 'Não definido'}</p>
              <p style="margin: 5px 0;"><strong>Dia desejado:</strong> ${notification.desiredPaymentDay}</p>
            </div>
            <p>Acesse o painel administrativo para realizar a alteração, se aprovada.</p>
            <br/>
            <p style="color: #666; font-size: 12px;">Este é um email automático, por favor não responda.</p>
          </div>
        `,
      };

    case 'INVITE_ACCEPTED':
      return {
        subject: `Convite aceito — ${notification.collaboratorName} criou sua conta`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">🎉 Convite Aceito</h2>
            <p>Olá,</p>
            <p><strong>${notification.collaboratorName}</strong> (${notification.collaboratorEmail}) aceitou o convite e criou sua conta no sistema.</p>
            <p>O colaborador já pode acessar o sistema normalmente.</p>
            <br/>
            <p style="color: #666; font-size: 12px;">Este é um email automático, por favor não responda.</p>
          </div>
        `,
      };

    case 'NEW_PENDING_PERSON':
      return {
        subject: `Novo cadastro pendente — ${notification.collaboratorName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">📋 Novo Cadastro Pendente</h2>
            <p>Olá,</p>
            <p>O gestor <strong>${notification.managerName}</strong> submeteu o cadastro de <strong>${notification.collaboratorName}</strong> (${notification.collaboratorEmail}) para aprovação.</p>
            <p>Acesse o painel administrativo para revisar e aprovar o cadastro.</p>
            <br/>
            <a href="${Deno.env.get('SUPABASE_URL')}" 
               style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Revisar Cadastro
            </a>
            <br/><br/>
            <p style="color: #666; font-size: 12px;">Este é um email automático, por favor não responda.</p>
          </div>
        `,
      };

    default:
      return {
        subject: "Notificação do Sistema de Férias",
        html: "<p>Você recebeu uma notificação do sistema de férias.</p>",
      };
  }
}

serve(handler);
