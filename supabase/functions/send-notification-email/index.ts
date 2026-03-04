import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: 'NEW_REQUEST' | 'APPROVAL_MANAGER' | 'APPROVAL_FINAL' | 'REJECTION' | 'REQUEST_INFO' | 'PAYMENT_DAY_CHANGE_REQUEST';
  to: string;
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
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const notification: NotificationRequest = await req.json();
    console.log("Processing notification:", notification.type, "to:", notification.to);

    const emailContent = generateEmailContent(notification);

    const emailResponse = await resend.emails.send({
      from: "Sistema de Férias <onboarding@resend.dev>",
      to: [notification.to],
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

    default:
      return {
        subject: "Notificação do Sistema de Férias",
        html: "<p>Você recebeu uma notificação do sistema de férias.</p>",
      };
  }
}

serve(handler);
