import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_SERVICE_ACCOUNT_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")!;
const GOOGLE_PRIVATE_KEY = (Deno.env.get("GOOGLE_PRIVATE_KEY") || "").replace(/\\n/g, "\n");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function pemToBinary(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64url(input: string | Uint8Array): string {
  const str = typeof input === "string" ? input : String.fromCharCode(...input);
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getGoogleAccessToken(): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBinary(GOOGLE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)));
  const jwt = `${signingInput}.${b64url(sig)}`;
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`Falha ao autenticar com Google: ${JSON.stringify(data)}`);
  return data.access_token;
}

function normalizeDate(raw?: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Authenticate caller
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Get caller person_id and papel
    const { data: profile } = await admin
      .from("profiles")
      .select("person_id, people:person_id(papel, is_admin)")
      .eq("user_id", userId)
      .maybeSingle();

    const callerPersonId = (profile as any)?.person_id;
    const callerPapel = (profile as any)?.people?.papel;
    const callerIsAdmin = (profile as any)?.people?.is_admin;

    if (!callerPersonId || !(callerIsAdmin === true || ["DIRETOR", "ADMIN"].includes(callerPapel))) {
      return new Response(JSON.stringify({ error: "Apenas diretores podem importar usuários" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get sheet id
    const { data: settings } = await admin
      .from("integration_settings")
      .select("sheets_users_id")
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .maybeSingle();

    const sheetId = settings?.sheets_users_id;
    if (!sheetId) {
      return new Response(JSON.stringify({ error: "Planilha de novos usuários não configurada" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: "Credenciais do Google não configuradas" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const accessToken = await getGoogleAccessToken();
    const range = "Novos_Usuarios!A2:K1000";
    const sheetsResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const sheetsData = await sheetsResp.json();
    if (!sheetsResp.ok) {
      return new Response(JSON.stringify({ error: `Erro ao ler planilha: ${sheetsData?.error?.message || "desconhecido"}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rows: string[][] = sheetsData.values || [];

    // Preload existing emails (people + pending)
    const { data: peopleEmails } = await admin.from("people").select("email");
    const { data: pendingEmails } = await admin
      .from("pending_people")
      .select("email, status")
      .in("status", ["PENDENTE", "APROVADO"]);

    const existingEmails = new Set<string>([
      ...(peopleEmails || []).map((r: any) => String(r.email || "").toLowerCase()),
      ...(pendingEmails || []).map((r: any) => String(r.email || "").toLowerCase()),
    ]);

    let imported = 0;
    let ignored = 0;
    let errors = 0;
    const ignoredList: Array<{ nome?: string; email?: string; motivo: string }> = [];
    const errorMessages: Array<{ linha: number; mensagem: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const linhaPlanilha = i + 2; // header is row 1
      const [
        nome, email, cargo, local, sub_time, papel, gestorEmail,
        dataContrato, modeloContrato, dataNascimento, diaPagamento,
      ] = row.map((v) => (v ?? "").toString().trim());

      if (!nome && !email) continue; // skip blank rows silently

      if (!nome || !email || !gestorEmail) {
        errors++;
        errorMessages.push({ linha: linhaPlanilha, mensagem: "Campos obrigatórios faltando (Nome, Email, Gestor)" });
        continue;
      }

      const emailLower = email.toLowerCase();
      if (existingEmails.has(emailLower)) {
        ignored++;
        ignoredList.push({ nome, email, motivo: "Já cadastrado no sistema" });
        continue;
      }

      // Resolve gestor
      const { data: gestor } = await admin
        .from("people")
        .select("id")
        .ilike("email", gestorEmail)
        .eq("ativo", true)
        .maybeSingle();

      if (!gestor) {
        errors++;
        errorMessages.push({ linha: linhaPlanilha, mensagem: `Gestor não encontrado: ${gestorEmail}` });
        continue;
      }

      const insertPayload: Record<string, unknown> = {
        nome,
        email,
        cargo: cargo || null,
        local: local || null,
        sub_time: sub_time || null,
        papel: papel || "COLABORADOR",
        gestor_id: gestor.id,
        data_contrato: normalizeDate(dataContrato),
        modelo_contrato: modeloContrato || "CLT",
        data_nascimento: normalizeDate(dataNascimento),
        dia_pagamento: diaPagamento ? parseInt(diaPagamento, 10) || null : null,
        status: "PENDENTE",
        created_by: callerPersonId,
      };

      const { error: insErr } = await admin.from("pending_people").insert(insertPayload);
      if (insErr) {
        errors++;
        errorMessages.push({ linha: linhaPlanilha, mensagem: insErr.message });
        continue;
      }

      existingEmails.add(emailLower);
      imported++;
    }

    await admin.from("audit_logs").insert({
      entidade: "pending_people",
      entidade_id: "SHEETS_IMPORT_USERS",
      acao: "SHEETS_IMPORT",
      actor_id: callerPersonId,
      payload: { imported, ignored, errors, ignoredList: ignoredList.slice(0, 50), errorMessages: errorMessages.slice(0, 50) },
    });

    return new Response(
      JSON.stringify({ success: true, imported, ignored, errors, ignoredList, errorMessages }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("sheets-import-users error", err);
    return new Response(JSON.stringify({ error: err?.message || "Erro inesperado" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
