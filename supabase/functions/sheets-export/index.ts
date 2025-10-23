import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_SERVICE_ACCOUNT_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")!;
const GOOGLE_PRIVATE_KEY = Deno.env.get("GOOGLE_PRIVATE_KEY")!.replace(/\\n/g, '\n');
const GOOGLE_SHEET_ID = Deno.env.get("GOOGLE_SHEET_ID")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STATUS_LABELS: Record<string, string> = {
  'RASCUNHO': 'Rascunho',
  'PENDENTE': 'Pendente',
  'AGUARDANDO_GESTOR': 'Aguardando Gestor',
  'AGUARDANDO_DIRETOR': 'Aguardando Diretor',
  'APROVADO_FINAL': 'Aprovado',
  'REJEITADO': 'Rejeitado',
  'CANCELADO': 'Cancelado',
  'REALIZADO': 'Realizado',
  'INFORMACOES_ADICIONAIS': 'Informações Adicionais',
};

async function getGoogleAccessToken(): Promise<string> {
  const encoder = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({
    iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));

  const signatureInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    encoder.encode(GOOGLE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(signatureInput)
  );
  
  const jwt = `${signatureInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type } = await req.json();
    console.log(`Starting sheets export: ${type}`);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const accessToken = await getGoogleAccessToken();

    if (type === 'requests') {
      // Export requests
      const { data: requests } = await supabase
        .from('requests')
        .select(`
          id,
          tipo,
          inicio,
          fim,
          status,
          created_at,
          requester:people!requester_id(nome)
        `)
        .order('created_at', { ascending: false })
        .limit(1000);

      // Prepare data for sheets
      const rows = [
        ['Request ID', 'Colaborador', 'Tipo', 'Início', 'Fim', 'Status', 'Criado em'],
        ...(requests || []).map(r => [
          r.id,
          r.requester?.nome || '',
          r.tipo,
          r.inicio || '',
          r.fim || '',
          STATUS_LABELS[r.status] || r.status,
          new Date(r.created_at).toLocaleDateString('pt-BR'),
        ]),
      ];

      // Clear and update sheet
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Requests_Export!A1:G${rows.length}:clear`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Requests_Export!A1?valueInputOption=RAW`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: rows }),
        }
      );

      console.log(`Exported ${rows.length - 1} requests`);

    } else if (type === 'vacation_balances') {
      // Export vacation balances
      const currentYear = new Date().getFullYear();
      
      const { data: people } = await supabase
        .from('people')
        .select('id, nome')
        .eq('ativo', true);

      const rows = [
        ['Colaborador', 'Ano', 'Dias Acumulados', 'Dias Usados', 'Saldo', 'Aniversário Contrato'],
      ];

      for (const person of people || []) {
        const { data: balanceData } = await supabase
          .rpc('recalculate_vacation_balance', {
            p_person_id: person.id,
            p_year: currentYear,
          });

        if (balanceData && balanceData.length > 0) {
          const balance = balanceData[0];
          rows.push([
            person.nome,
            currentYear.toString(),
            balance.accrued_days?.toString() || '0',
            balance.used_days?.toString() || '0',
            balance.balance_days?.toString() || '0',
            balance.contract_anniversary ? new Date(balance.contract_anniversary).toLocaleDateString('pt-BR') : '',
          ]);
        }
      }

      // Clear and update sheet
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Saldos_Ferias!A1:F${rows.length}:clear`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/Saldos_Ferias!A1?valueInputOption=RAW`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ values: rows }),
        }
      );

      console.log(`Exported ${rows.length - 1} vacation balances`);
    }

    // Log to audit
    await supabase.from('audit_logs').insert({
      entidade: 'sheets',
      entidade_id: `EXPORT_${type}`,
      acao: 'EXPORT',
      actor_id: 'SYSTEM',
      payload: { type, timestamp: new Date().toISOString() },
    });

    return new Response(
      JSON.stringify({ success: true, type }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in sheets-export:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
