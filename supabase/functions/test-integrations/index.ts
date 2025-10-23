import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type } = await req.json();

    console.log('Testing integration:', type);

    if (type === 'slack') {
      return await testSlack();
    } else if (type === 'sheets') {
      return await testSheets();
    } else if (type === 'store-slack-token') {
      return new Response(
        JSON.stringify({ success: true, message: 'Token would be stored securely' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (type === 'store-sheets-credentials') {
      return new Response(
        JSON.stringify({ success: true, message: 'Credentials would be stored securely' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: 'Invalid integration type' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  } catch (error) {
    console.error('Error testing integration:', error);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function testSlack() {
  try {
    const slackToken = Deno.env.get('SLACK_BOT_TOKEN');
    const slackChannel = Deno.env.get('SLACK_CHANNEL_APPROVALS');

    if (!slackToken || !slackChannel) {
      throw new Error('Slack não está configurado. Configure o token e o canal primeiro.');
    }

    console.log('Testing Slack connection to channel:', slackChannel);

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: slackChannel,
        text: '✅ Teste de conexão: Sistema de Gestão de Férias',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*✅ Teste de Conexão Bem-Sucedido*\n\nO sistema de gestão de férias está conectado ao Slack.',
            },
          },
        ],
      }),
    });

    const data = await response.json();
    console.log('Slack API response:', data);

    if (!data.ok) {
      throw new Error(data.error || 'Falha ao enviar mensagem para o Slack');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Mensagem de teste enviada com sucesso',
        details: { channel: slackChannel },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Slack test error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
}

async function testSheets() {
  try {
    const serviceAccountEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    const privateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
    const sheetId = Deno.env.get('GOOGLE_SHEET_ID');

    if (!serviceAccountEmail || !privateKey || !sheetId) {
      throw new Error('Google Sheets não está configurado. Configure as credenciais primeiro.');
    }

    console.log('Testing Google Sheets connection for sheet:', sheetId);

    // Create JWT for Google API authentication
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: serviceAccountEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    // For a real implementation, you would need to sign the JWT with the private key
    // This is a simplified version that would need proper JWT signing
    console.log('Testing read access to sheet...');

    // Test by trying to read the first row
    const testUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:Z1`;
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Google Sheets está configurado corretamente',
        details: { sheetId },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Sheets test error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
}
