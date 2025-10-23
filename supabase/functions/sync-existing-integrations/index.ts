import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for existing secrets
    const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");
    const SLACK_CHANNEL = Deno.env.get("SLACK_CHANNEL_APPROVALS");
    const GOOGLE_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const GOOGLE_KEY = Deno.env.get("GOOGLE_PRIVATE_KEY");
    const GOOGLE_SHEET_ID = Deno.env.get("GOOGLE_SHEET_ID");

    const updates: any = {
      updated_at: new Date().toISOString(),
    };
    const report: any = { slack: false, sheets: false, details: [] };

    // Check Slack integration
    if (SLACK_BOT_TOKEN && SLACK_CHANNEL) {
      updates.slack_enabled = true;
      updates.slack_bot_token_set = true;
      updates.slack_channel_approvals = SLACK_CHANNEL;
      updates.slack_status = 'configured';
      report.slack = true;
      report.details.push('Slack configurado com sucesso');
      console.log('Slack integration detected');
    } else {
      console.log('Slack integration not found');
      if (!SLACK_BOT_TOKEN) report.details.push('SLACK_BOT_TOKEN não encontrado');
      if (!SLACK_CHANNEL) report.details.push('SLACK_CHANNEL_APPROVALS não encontrado');
    }

    // Check Google Sheets integration
    if (GOOGLE_EMAIL && GOOGLE_KEY && GOOGLE_SHEET_ID) {
      updates.sheets_enabled = true;
      updates.sheets_service_account_set = true;
      updates.sheets_id = GOOGLE_SHEET_ID;
      updates.sheets_status = 'configured';
      report.sheets = true;
      report.details.push('Google Sheets configurado com sucesso');
      console.log('Google Sheets integration detected');
    } else {
      console.log('Google Sheets integration not found');
      if (!GOOGLE_EMAIL) report.details.push('GOOGLE_SERVICE_ACCOUNT_EMAIL não encontrado');
      if (!GOOGLE_KEY) report.details.push('GOOGLE_PRIVATE_KEY não encontrado');
      if (!GOOGLE_SHEET_ID) report.details.push('GOOGLE_SHEET_ID não encontrado');
    }

    // Update integration_settings table
    if (report.slack || report.sheets) {
      const { error } = await supabase
        .from('integration_settings')
        .update(updates)
        .eq('id', '00000000-0000-0000-0000-000000000000');

      if (error) {
        console.error('Error updating integration_settings:', error);
        throw error;
      }

      console.log('Integration settings updated successfully');
    }

    const syncedIntegrations = [];
    if (report.slack) syncedIntegrations.push('Slack');
    if (report.sheets) syncedIntegrations.push('Google Sheets');

    return new Response(
      JSON.stringify({
        success: true,
        report,
        message: syncedIntegrations.length > 0
          ? `Integrações sincronizadas: ${syncedIntegrations.join(', ')}`
          : 'Nenhuma integração encontrada',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in sync-existing-integrations:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
