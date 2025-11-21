import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  email: string;
  nome: string;
  pessoa_id: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, nome, pessoa_id }: WelcomeEmailRequest = await req.json();

    console.log(`Sending welcome email to Figma user: ${email} (${nome})`);

    // Get person details for more context
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: person } = await supabase
      .from("people")
      .select("nome, cargo, sub_time, gestor_id, people!inner(nome)")
      .eq("id", pessoa_id)
      .single();

    const emailResponse = await resend.emails.send({
      from: "Sistema de Férias <onboarding@resend.dev>",
      to: [email],
      subject: "Bem-vindo(a) ao Sistema de Gestão de Férias!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Olá, ${nome}! 👋</h1>
          
          <p style="color: #555; font-size: 16px; line-height: 1.5;">
            Seu acesso ao <strong>Sistema de Gestão de Férias</strong> foi configurado automaticamente através do Figma!
          </p>

          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #333; margin-top: 0;">Informações do seu perfil:</h2>
            <ul style="color: #555; line-height: 1.8;">
              <li><strong>Nome:</strong> ${person?.nome || nome}</li>
              ${person?.cargo ? `<li><strong>Cargo:</strong> ${person.cargo}</li>` : ''}
              ${person?.sub_time ? `<li><strong>Time:</strong> ${person.sub_time}</li>` : ''}
            </ul>
          </div>

          <p style="color: #555; font-size: 16px; line-height: 1.5;">
            Agora você pode:
          </p>
          <ul style="color: #555; font-size: 16px; line-height: 1.8;">
            <li>Solicitar férias e dayoffs</li>
            <li>Consultar seu saldo de férias</li>
            <li>Visualizar o calendário da equipe</li>
            <li>Acompanhar suas solicitações</li>
          </ul>

          <div style="margin: 30px 0; text-align: center;">
            <a href="${supabaseUrl.replace('.supabase.co', '')}" 
               style="background-color: #0066cc; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Acessar Sistema
            </a>
          </div>

          <p style="color: #999; font-size: 14px; margin-top: 40px;">
            Se você não solicitou este acesso, entre em contato com o RH.
          </p>
        </div>
      `,
    });

    console.log("Welcome email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error sending welcome email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
