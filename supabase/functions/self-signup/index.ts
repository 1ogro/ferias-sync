import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { lookupSlackUserByEmail, sendSlackDM, sendEmail } from "../_shared/notify-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_URL = "https://ferias-sync.lovable.app";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface PersonRow {
  id: string;
  nome: string;
  email: string | null;
  email_pessoal: string | null;
  slack_user_id?: string | null;
}

/**
 * Sends the signup confirmation redundantly via Email + Slack DM.
 * Slack lookup cascade: people.slack_user_id -> corporate email -> personal email.
 * Backfills people.slack_user_id when found by email.
 */
async function sendSignupConfirmation(
  admin: any,
  person: PersonRow,
  authEmail: string,
  pendingConfirmation = false,
): Promise<{ slack_delivered: boolean; email_delivered: boolean }> {
  const firstName = (person.nome || "").split(" ")[0] || "Olá";

  const slackText = pendingConfirmation
    ? `:hourglass_flowing_sand: *Cadastro recebido — falta confirmar o e-mail*\n\n` +
      `Oi, ${firstName}! Sua conta no Sistema de Férias foi criada, mas ainda *não está ativa*.\n` +
      `Abra o e-mail de confirmação enviado para \`${authEmail}\` e clique no link para ativar o acesso.\n\n` +
      `Se o e-mail não chegar, procure o administrador.`
    : `:white_check_mark: *Cadastro confirmado!*\n\n` +
      `Oi, ${firstName}! Sua conta no Sistema de Férias foi criada e já está ativa.\n` +
      `E-mail de acesso: \`${authEmail}\`\n\n` +
      `Acesse: ${APP_URL}`;

  const emailHtml = pendingConfirmation
    ? `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1f2937;">
      <h2 style="margin:0 0 12px;">Cadastro recebido — falta confirmar o e-mail</h2>
      <p>Oi, ${firstName}! Sua conta no <strong>Sistema de Férias</strong> foi criada, mas ainda <strong>não está ativa</strong>.</p>
      <p>Abra o e-mail de confirmação enviado para <strong>${authEmail}</strong> e clique no link para ativar o acesso.</p>
      <p style="color:#6b7280;font-size:13px;">Se o e-mail de confirmação não chegar, procure o administrador.</p>
    </div>`
    : `
    <div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #1f2937;">
      <h2 style="margin:0 0 12px;">Cadastro confirmado</h2>
      <p>Oi, ${firstName}! Sua conta no <strong>Sistema de Férias</strong> foi criada e já está ativa.</p>
      <p>E-mail de acesso: <strong>${authEmail}</strong></p>
      <p><a href="${APP_URL}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Acessar o sistema</a></p>
      <p style="color:#6b7280;font-size:13px;">Se você não fez este cadastro, avise o administrador.</p>
    </div>`;

  // Slack lookup cascade
  let slackId: string | null = person.slack_user_id || null;
  let foundByEmail = false;
  if (!slackId) {
    const candidates = [person.email, person.email_pessoal, authEmail]
      .filter((e): e is string => !!e)
      .map((e) => e.toLowerCase());
    for (const candidate of Array.from(new Set(candidates))) {
      slackId = await lookupSlackUserByEmail(candidate);
      if (slackId) {
        foundByEmail = true;
        break;
      }
    }
  }

  const results = await Promise.allSettled([
    slackId ? sendSlackDM(slackId, slackText) : Promise.reject(new Error("slack_user_not_found")),
    sendEmail(
      authEmail,
      pendingConfirmation
        ? "Confirme seu cadastro — Sistema de Férias"
        : "Cadastro confirmado — Sistema de Férias",
      emailHtml,
    ),
  ]);

  const slack_delivered = results[0].status === "fulfilled" && !!slackId;
  const email_delivered = results[1].status === "fulfilled";

  if (slackId && foundByEmail) {
    await admin
      .from("people")
      .update({ slack_user_id: slackId })
      .eq("id", person.id)
      .then(
        () => {},
        (e: any) => console.error("slack_user_id backfill failed:", e?.message),
      );
  }

  await admin.from("audit_logs").insert({
    entidade: "people",
    entidade_id: person.id,
    acao: "SIGNUP_CONFIRMATION_SENT",
    actor_id: person.id,
    payload: {
      auth_email: authEmail,
      slack_delivered,
      email_delivered,
      slack_user_id: slackId,
      slack_found_by_email: foundByEmail,
      pending_confirmation: pendingConfirmation,
    },
  });

  return { slack_delivered, email_delivered };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mode = typeof body.mode === "string" ? body.mode : "signup";
    const personId = typeof body.person_id === "string" ? body.person_id.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Notify-only mode: used by the standard signup fallback so the confirmation
    // still goes out redundantly (Email + Slack DM).
    if (mode === "notify") {
      if (!personId || !emailRegex.test(email)) {
        return json({ success: false, code: "invalid_input", message: "Dados inválidos." }, 200);
      }
      const { data: person } = await admin
        .from("people")
        .select("id, nome, email, email_pessoal, slack_user_id")
        .eq("id", personId)
        .maybeSingle();

      if (!person) {
        return json({ success: false, code: "person_not_found", message: "Colaborador não encontrado." }, 200);
      }

      // The notify-only mode is used by the standard signup fallback, where the
      // account still requires the email confirmation click. Default to pending.
      const pending = body.pending_confirmation !== false;
      const delivery = await sendSignupConfirmation(admin, person as PersonRow, email, pending);
      return json({ success: true, ...delivery });
    }

    if (!personId || !emailRegex.test(email) || email.length > 255 || password.length < 6) {
      return json(
        { success: false, code: "invalid_input", message: "Dados inválidos. Verifique email, senha (mín. 6 caracteres) e a pessoa selecionada." },
        200,
      );
    }

    const { data: person, error: personError } = await admin
      .from("people")
      .select("id, nome, email, email_pessoal, slack_user_id, ativo")
      .eq("id", personId)
      .maybeSingle();

    if (personError) {
      console.error("Error loading person:", personError);
      return json({ success: false, code: "person_lookup_failed", message: "Não foi possível validar o colaborador." }, 200);
    }

    if (!person || person.ativo === false) {
      return json({ success: false, code: "person_not_found", message: "Colaborador não encontrado ou inativo." }, 200);
    }

    const corporate = (person.email || "").toLowerCase();
    const personal = (person.email_pessoal || "").toLowerCase();
    const matchMethod = email === corporate ? "corporate" : email === personal ? "personal" : null;

    if (!matchMethod) {
      return json(
        {
          success: false,
          code: "email_mismatch",
          message:
            "Esse email não está cadastrado no perfil do colaborador. Peça ao administrador para cadastrar seu email pessoal, ou use o email corporativo.",
        },
        200,
      );
    }

    // Person already linked to an account?
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("person_id", personId)
      .maybeSingle();

    if (existingProfile) {
      return json(
        { success: false, code: "person_already_linked", message: "Esse colaborador já possui uma conta. Faça login ou use 'Esqueci minha senha'." },
        200,
      );
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { person_id: personId, self_signup_match: matchMethod },
    });

    if (createError || !created?.user) {
      const msg = (createError?.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return json(
          { success: false, code: "email_taken", message: "Já existe uma conta com esse email. Faça login ou use 'Esqueci minha senha'." },
          200,
        );
      }
      console.error("createUser failed:", createError);
      return json({ success: false, code: "create_failed", message: createError?.message || "Não foi possível criar a conta." }, 200);
    }

    const userId = created.user.id;

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({ user_id: userId, person_id: personId }, { onConflict: "user_id" });

    if (profileError) {
      console.error("Profile link failed, rolling back user:", profileError);
      await admin.auth.admin.deleteUser(userId).catch((e) => console.error("rollback failed:", e));
      return json({ success: false, code: "link_failed", message: "Conta criada, mas não foi possível vincular ao perfil. Tente novamente." }, 200);
    }

    await admin.from("audit_logs").insert({
      entidade: "people",
      entidade_id: personId,
      acao: "SELF_SIGNUP_CONFIRMED",
      actor_id: personId,
      payload: { auth_email: email, match_method: matchMethod, user_id: userId },
    });

    let delivery = { slack_delivered: false, email_delivered: false };
    try {
      delivery = await sendSignupConfirmation(admin, person as PersonRow, email);
    } catch (e: any) {
      console.error("signup confirmation failed:", e?.message);
    }

    return json({ success: true, message: "Conta criada com sucesso.", match_method: matchMethod, ...delivery });
  } catch (error) {
    console.error("self-signup error:", error);
    return json({ success: false, code: "unexpected", message: "Erro inesperado ao criar a conta." }, 500);
  }
});
