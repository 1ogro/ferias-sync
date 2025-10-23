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
    console.log("Starting sheets import...");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Google Sheets access token
    const accessToken = await getGoogleAccessToken();

    // Read "Colaboradores" sheet
    const sheetRange = "Colaboradores!A2:J1000"; // Adjust range as needed
    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${sheetRange}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const sheetsData = await sheetsResponse.json();
    const rows = sheetsData.values || [];

    console.log(`Found ${rows.length} rows in sheet`);

    let imported = 0;
    let updated = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    for (const row of rows) {
      try {
        // Row structure: ID, Nome, Email, Cargo, Sub-Time, Papel, Data Nascimento, Data Contrato, Modelo Contrato, Ativo
        const [id, nome, email, cargo, sub_time, papel, data_nascimento, data_contrato, modelo_contrato, ativo] = row;

        if (!id || !nome || !email) {
          errors++;
          errorMessages.push(`Linha sem ID/Nome/Email: ${JSON.stringify(row)}`);
          continue;
        }

        // Check if person exists
        const { data: existingPerson } = await supabase
          .from('people')
          .select('id')
          .eq('id', id)
          .single();

        const personData = {
          id,
          nome,
          email,
          cargo: cargo || null,
          sub_time: sub_time || null,
          papel: papel || 'COLABORADOR',
          data_nascimento: data_nascimento || null,
          data_contrato: data_contrato || null,
          modelo_contrato: modelo_contrato || 'CLT',
          ativo: ativo?.toUpperCase() === 'TRUE' || ativo === '1',
        };

        if (existingPerson) {
          // Update existing
          const { error } = await supabase
            .from('people')
            .update(personData)
            .eq('id', id);

          if (error) throw error;
          updated++;
        } else {
          // Insert new
          const { error } = await supabase
            .from('people')
            .insert(personData);

          if (error) throw error;
          imported++;
        }
      } catch (err: any) {
        errors++;
        errorMessages.push(`Erro ao processar linha: ${err.message}`);
        console.error("Error processing row:", err);
      }
    }

    // Log to audit
    await supabase.from('audit_logs').insert({
      entidade: 'people',
      entidade_id: 'SHEETS_IMPORT',
      acao: 'IMPORT',
      actor_id: 'SYSTEM',
      payload: { imported, updated, errors, errorMessages: errorMessages.slice(0, 10) },
    });

    console.log(`Import complete: ${imported} imported, ${updated} updated, ${errors} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        imported, 
        updated, 
        errors,
        errorMessages: errorMessages.slice(0, 10),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in sheets-import:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
