import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

async function sendRecoveryEmail(
  to: string,
  name: string,
  recoveryLink: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!Deno.env.get("RESEND_API_KEY")) {
      return { ok: false, error: "no_resend_key" };
    }
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <h2 style="margin: 0 0 16px;">🔑 Redefinir sua senha</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:</p>
        <p style="margin: 24px 0;">
          <a href="${recoveryLink}"
             style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
            Redefinir minha senha
          </a>
        </p>
        <p style="font-size: 13px; color:#475569;">Se o botão não funcionar, copie e cole este link no navegador:</p>
        <p style="font-size: 12px; word-break: break-all; color:#475569;">${recoveryLink}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="font-size: 12px; color:#64748b;">🔒 Se você não solicitou esta alteração, ignore este email.</p>
      </div>
    `;
    const res = await resend.emails.send({
      from: "Sistema de Férias <onboarding@resend.dev>",
      to: [to],
      subject: "Redefinir sua senha",
      html,
    });
    if ((res as any)?.error) {
      return { ok: false, error: String((res as any).error?.message ?? (res as any).error) };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-debug, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (stage: string, payload: Record<string, unknown> = {}) => {
  try {
    console.log(JSON.stringify({ stage, ...payload }));
  } catch {
    console.log(stage, payload);
  }
};

async function sendSlackChannel(text: string) {
  try {
    const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
    const slackChannel = Deno.env.get("SLACK_CHANNEL_APPROVALS");
    if (!slackToken || !slackChannel) return;
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: slackChannel, text }),
    });
  } catch (e) {
    console.error("Slack channel notification failed:", e);
  }
}

async function findSlackUserByName(
  slackToken: string,
  query: string
): Promise<string | null> {
  const q = query.replace(/^@/, "").toLowerCase();
  let cursor = "";
  do {
    const url = `https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${slackToken}` } });
    const data = await res.json();
    if (!data.ok) {
      log("slack_users_list_error", { error: data.error });
      return null;
    }
    const match = data.members?.find((u: any) => {
      const candidates = [
        u.name,
        u.real_name,
        u.profile?.display_name,
        u.profile?.real_name,
        u.profile?.display_name_normalized,
        u.profile?.real_name_normalized,
      ]
        .filter(Boolean)
        .map((s: string) => s.toLowerCase());
      return candidates.some((c) => c === q || c.includes(q) || q.includes(c));
    });
    if (match) return match.id;
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);
  return null;
}

async function lookupSlackByEmail(
  slackToken: string,
  email: string
): Promise<string | null> {
  const res = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${slackToken}` } }
  );
  const data = await res.json();
  if (!data.ok) {
    log("slack_lookup_email_error", { email, error: data.error });
    return null;
  }
  return data.user?.id ?? null;
}

async function postSlackDM(
  slackToken: string,
  userId: string,
  text: string,
  blocks: any[]
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${slackToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: userId, text, blocks }),
  });
  const data = await res.json();
  if (!data.ok) return { ok: false, error: data.error };
  return { ok: true };
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const debug = req.headers.get("x-debug") === "1";
  const respond = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(debug ? body : { ok: true }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    // Backwards compat: aceitar `email` ou `identifier`
    const rawIdentifier = (
      typeof body?.identifier === "string"
        ? body.identifier
        : typeof body?.email === "string"
        ? body.email
        : ""
    )
      .trim();

    if (!rawIdentifier) {
      log("missing_identifier");
      return respond({ ok: true, reason: "missing_identifier" });
    }

    const identifierType: "email" | "handle" = isEmail(rawIdentifier) ? "email" : "handle";
    const identifierLower = rawIdentifier.toLowerCase();

    // Redirect seguro
    const FALLBACK_REDIRECT =
      Deno.env.get("PUBLIC_APP_URL") ?? "https://ferias-sync.lovable.app/reset-password";
    let redirectTo = FALLBACK_REDIRECT;
    const rawRedirect = typeof body?.redirectTo === "string" ? body.redirectTo.trim() : "";
    if (
      rawRedirect &&
      rawRedirect.startsWith("https://") &&
      !/localhost|127\.0\.0\.1/i.test(rawRedirect)
    ) {
      redirectTo = rawRedirect;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (!slackToken) {
      log("slack_token_missing");
      sendSlackChannel(`⚠️ Reset de senha solicitado mas SLACK_BOT_TOKEN ausente (identifier=${rawIdentifier})`);
      return respond({ ok: true, dm_status: "skipped_no_token" });
    }

    // 1) Resolver person
    let person: { id: string; nome: string; email: string } | null = null;
    if (identifierType === "email") {
      const { data } = await admin
        .from("people")
        .select("id, nome, email, ativo")
        .ilike("email", identifierLower)
        .eq("ativo", true)
        .maybeSingle();
      person = data ? { id: data.id, nome: data.nome, email: data.email } : null;
    } else {
      const { data } = await admin
        .from("people")
        .select("id, nome, email, ativo")
        .ilike("nome", `%${rawIdentifier.replace(/^@/, "")}%`)
        .eq("ativo", true)
        .limit(2);
      if (data && data.length === 1) {
        person = { id: data[0].id, nome: data[0].nome, email: data[0].email };
      } else if (data && data.length > 1) {
        log("multiple_people_for_handle", { identifier: rawIdentifier, count: data.length });
      }
    }

    log("person_lookup", { identifierType, found: !!person, personId: person?.id });

    if (!person) {
      return respond({ ok: true, reason: "person_not_found" });
    }

    // 2) Resolver Slack user ID
    let slackUserId: string | null = null;
    let lookupMethod: "email" | "name" | "person_email" | "none" = "none";

    if (identifierType === "email") {
      slackUserId = await lookupSlackByEmail(slackToken, identifierLower);
      if (slackUserId) lookupMethod = "email";
    } else {
      slackUserId = await findSlackUserByName(slackToken, rawIdentifier);
      if (slackUserId) lookupMethod = "name";
    }
    if (!slackUserId && person.email) {
      slackUserId = await lookupSlackByEmail(slackToken, person.email);
      if (slackUserId) lookupMethod = "person_email";
    }
    if (!slackUserId) {
      slackUserId = await findSlackUserByName(slackToken, person.nome);
      if (slackUserId) lookupMethod = "name";
    }

    log("slack_lookup", { method: lookupMethod, slackUserId });

    if (!slackUserId) {
      sendSlackChannel(
        `⚠️ *Reset de senha* — não foi possível localizar *${person.nome}* (${person.email}) no Slack.`
      );
      await admin.from("audit_logs").insert({
        entidade: "auth",
        entidade_id: person.id,
        acao: "USER_PASSWORD_RESET_SLACK",
        actor_id: person.id,
        payload: {
          identifier_type: identifierType,
          slack_lookup_method: lookupMethod,
          dm_status: "failed",
          dm_error: "slack_user_not_found",
        },
      });
      return respond({ ok: true, dm_status: "failed", dm_error: "slack_user_not_found" });
    }

    // 3) Garantir auth user e gerar link de recovery
    const { data: usersData } = await admin.auth.admin.listUsers();
    let authUser = usersData?.users?.find(
      (u: any) => (u.email || "").toLowerCase() === person.email.toLowerCase()
    );
    let authUserCreated = false;

    if (!authUser) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: person.email,
        email_confirm: true,
        user_metadata: { auto_created_for_password_reset: true, person_id: person.id },
      });
      if (createErr) {
        log("auth_user_create_error", { error: createErr.message });
      } else {
        authUser = created?.user ?? undefined;
        authUserCreated = !!authUser;
      }
    } else if (!authUser.email_confirmed_at) {
      // Confirmar email para permitir recovery
      const { error: updErr } = await admin.auth.admin.updateUserById(authUser.id, {
        email_confirm: true,
      } as any);
      if (updErr) log("auth_user_confirm_error", { error: updErr.message });
    }

    if (!authUser) {
      sendSlackChannel(
        `⚠️ *Reset de senha* — não consegui preparar usuário auth para *${person.nome}* (${person.email}).`
      );
      return respond({ ok: true, dm_status: "failed", dm_error: "auth_user_unavailable" });
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: person.email,
      options: { redirectTo },
    });
    if (linkError || !linkData?.properties?.action_link) {
      log("generate_link_error", { error: linkError?.message });
      sendSlackChannel(
        `⚠️ *Reset de senha* — falha ao gerar link para *${person.nome}* (${person.email}): ${linkError?.message ?? "sem link"}`
      );
      return respond({ ok: true, dm_status: "failed", dm_error: "link_generation_failed" });
    }
    const recoveryLink = linkData.properties.action_link;
    log("link_generated", { personId: person.id, authUserCreated });

    // 4) Enviar DM
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🔑 Olá, *${person.nome}*!\n\nRecebemos um pedido para redefinir a sua senha.`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Clique no link abaixo para criar uma nova senha:\n\n<${recoveryLink}|🔗 Redefinir minha senha>`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "🔒 Se você não solicitou esta alteração, ignore esta mensagem.",
          },
        ],
      },
    ];

    const dmResult = await postSlackDM(
      slackToken,
      slackUserId,
      `Olá ${person.nome}! Acesse ${recoveryLink} para redefinir sua senha.`,
      blocks
    );

    log("dm_result", { ok: dmResult.ok, error: dmResult.error });

    // 5) Audit + canal admin
    await admin.from("audit_logs").insert({
      entidade: "auth",
      entidade_id: person.id,
      acao: "USER_PASSWORD_RESET_SLACK",
      actor_id: person.id,
      payload: {
        identifier_type: identifierType,
        slack_lookup_method: lookupMethod,
        dm_status: dmResult.ok ? "sent" : "failed",
        dm_error: dmResult.error,
        auth_user_created: authUserCreated,
        target_email: person.email,
        target_name: person.nome,
      },
    });

    const statusLabel = dmResult.ok
      ? "✅ DM enviada"
      : `⚠️ falha DM (${dmResult.error ?? "erro"})`;
    sendSlackChannel(
      `🔑 *Reset de senha* — *${person.nome}* (${person.email}) — ${statusLabel}${authUserCreated ? " · auth user criado" : ""}`
    );

    return respond({
      ok: true,
      dm_status: dmResult.ok ? "sent" : "failed",
      dm_error: dmResult.error,
      lookup_method: lookupMethod,
      auth_user_created: authUserCreated,
    });
  } catch (e: any) {
    console.error("send-password-reset-slack error:", e);
    return respond({ ok: true, error: String(e?.message ?? e) });
  }
});
