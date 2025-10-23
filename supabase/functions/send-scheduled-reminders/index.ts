import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReminderRequest {
  type: 'DAILY_PENDING' | 'WEEKLY_DIRECTOR' | 'MONTHLY_VACATION_ALERTS';
  days_threshold?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { type, days_threshold = 3 }: ReminderRequest = await req.json();

    console.log(`Processing reminder: ${type}`);

    if (type === 'DAILY_PENDING') {
      // Find pending requests older than days_threshold
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days_threshold);

      const { data: pendingRequests, error } = await supabase
        .from('requests')
        .select(`
          id,
          tipo,
          inicio,
          fim,
          created_at,
          requester:people!requester_id(id, nome, gestor_id)
        `)
        .in('status', ['PENDENTE', 'AGUARDANDO_GESTOR', 'AGUARDANDO_DIRETOR'])
        .lt('created_at', cutoffDate.toISOString());

      if (error) throw error;

      // Group by manager
      const byManager = new Map<string, any[]>();
      for (const req of pendingRequests || []) {
        const managerId = req.requester.gestor_id;
        if (!managerId) continue;
        if (!byManager.has(managerId)) byManager.set(managerId, []);
        byManager.get(managerId)!.push(req);
      }

      // Send emails to managers
      for (const [managerId, requests] of byManager) {
        const { data: manager } = await supabase
          .from('people')
          .select('nome, email')
          .eq('id', managerId)
          .single();

        if (!manager?.email) continue;

        const requestsList = requests.map(r => 
          `• ${r.requester.nome} - ${r.tipo} (${r.inicio} a ${r.fim})`
        ).join('\n');

        await resend.emails.send({
          from: "Sistema de Férias <onboarding@resend.dev>",
          to: [manager.email],
          subject: `⏰ Lembretes: ${requests.length} solicitações pendentes`,
          html: `
            <h2>Olá, ${manager.nome}!</h2>
            <p>Você tem <strong>${requests.length} solicitações</strong> aguardando sua aprovação há mais de ${days_threshold} dias:</p>
            <pre>${requestsList}</pre>
            <p>Por favor, revise estas solicitações em breve.</p>
            <a href="${supabaseUrl.replace('.supabase.co', '.lovable.app')}/inbox" style="display:inline-block;padding:10px 20px;background:#0066cc;color:white;text-decoration:none;border-radius:5px;">Ver Solicitações</a>
          `,
        });

        console.log(`Reminder sent to manager ${manager.nome}`);
      }

      return new Response(
        JSON.stringify({ success: true, sent: byManager.size }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (type === 'WEEKLY_DIRECTOR') {
      const { data: directors } = await supabase
        .from('people')
        .select('id, nome, email')
        .eq('papel', 'DIRETOR')
        .eq('ativo', true);

      for (const director of directors || []) {
        const { data: pendingRequests } = await supabase
          .from('requests')
          .select(`
            id,
            tipo,
            inicio,
            fim,
            requester:people!requester_id(nome)
          `)
          .eq('status', 'AGUARDANDO_DIRETOR');

        if (!pendingRequests?.length) continue;

        const requestsList = pendingRequests.map(r => 
          `• ${r.requester.nome} - ${r.tipo} (${r.inicio} a ${r.fim})`
        ).join('\n');

        await resend.emails.send({
          from: "Sistema de Férias <onboarding@resend.dev>",
          to: [director.email],
          subject: `📋 Resumo Semanal: ${pendingRequests.length} solicitações aguardando`,
          html: `
            <h2>Olá, ${director.nome}!</h2>
            <p>Você tem <strong>${pendingRequests.length} solicitações</strong> aguardando sua aprovação:</p>
            <pre>${requestsList}</pre>
            <a href="${supabaseUrl.replace('.supabase.co', '.lovable.app')}/inbox" style="display:inline-block;padding:10px 20px;background:#0066cc;color:white;text-decoration:none;border-radius:5px;">Ver Solicitações</a>
          `,
        });

        console.log(`Weekly reminder sent to director ${director.nome}`);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (type === 'MONTHLY_VACATION_ALERTS') {
      const currentYear = new Date().getFullYear();

      // Get all active people with their vacation balances
      const { data: balances } = await supabase
        .rpc('recalculate_vacation_balance', { 
          p_person_id: '', 
          p_year: currentYear 
        });

      const { data: people } = await supabase
        .from('people')
        .select('id, nome, gestor_id')
        .eq('ativo', true);

      // Group by manager and find issues
      const alerts = new Map<string, { negative: any[], accumulated: any[] }>();

      for (const person of people || []) {
        const balance = balances?.find((b: any) => b.person_id === person.id);
        if (!balance || !person.gestor_id) continue;

        if (!alerts.has(person.gestor_id)) {
          alerts.set(person.gestor_id, { negative: [], accumulated: [] });
        }

        if (balance.balance_days < 0) {
          alerts.get(person.gestor_id)!.negative.push({ ...person, balance: balance.balance_days });
        } else if (balance.balance_days > 30) {
          alerts.get(person.gestor_id)!.accumulated.push({ ...person, balance: balance.balance_days });
        }
      }

      // Send alerts to managers
      for (const [managerId, { negative, accumulated }] of alerts) {
        if (negative.length === 0 && accumulated.length === 0) continue;

        const { data: manager } = await supabase
          .from('people')
          .select('nome, email')
          .eq('id', managerId)
          .single();

        if (!manager?.email) continue;

        let alertHtml = `<h2>Olá, ${manager.nome}!</h2><p>Alerta mensal de férias da sua equipe:</p>`;

        if (negative.length > 0) {
          alertHtml += `<h3>⚠️ Saldos Negativos (${negative.length}):</h3><ul>`;
          alertHtml += negative.map(p => `<li>${p.nome}: ${p.balance} dias</li>`).join('');
          alertHtml += `</ul>`;
        }

        if (accumulated.length > 0) {
          alertHtml += `<h3>📊 Férias Acumuladas (${accumulated.length}):</h3><ul>`;
          alertHtml += accumulated.map(p => `<li>${p.nome}: ${p.balance} dias</li>`).join('');
          alertHtml += `</ul>`;
        }

        await resend.emails.send({
          from: "Sistema de Férias <onboarding@resend.dev>",
          to: [manager.email],
          subject: `📅 Alerta Mensal: Férias da Equipe`,
          html: alertHtml,
        });

        console.log(`Monthly alert sent to manager ${manager.nome}`);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown reminder type: ${type}`);
  } catch (error: any) {
    console.error("Error in send-scheduled-reminders:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
