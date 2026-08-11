import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const personId = typeof body.person_id === "string" ? body.person_id.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!personId || !emailRegex.test(email) || email.length > 255 || password.length < 6) {
      return json(
        { success: false, code: "invalid_input", message: "Dados inválidos. Verifique email, senha (mín. 6 caracteres) e a pessoa selecionada." },
        200,
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: person, error: personError } = await admin
      .from("people")
      .select("id, nome, email, email_pessoal, ativo")
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

    return json({ success: true, message: "Conta criada com sucesso.", match_method: matchMethod });
  } catch (error) {
    console.error("self-signup error:", error);
    return json({ success: false, code: "unexpected", message: "Erro inesperado ao criar a conta." }, 500);
  }
});
