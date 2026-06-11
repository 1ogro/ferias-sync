import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sendSlackNotification(text: string) {
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
  personName: string
): Promise<string | null> {
  let cursor = "";
  do {
    const url = `https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${slackToken}` },
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("users.list error:", data.error);
      return null;
    }
    const nameLower = personName.toLowerCase();
    const match = data.members?.find(
      (u: any) =>
        u.real_name?.toLowerCase()?.includes(nameLower) ||
        nameLower.includes(u.real_name?.toLowerCase() || "___") ||
        u.profile?.display_name?.toLowerCase()?.includes(nameLower) ||
        nameLower.includes(u.profile?.display_name?.toLowerCase() || "___") ||
        u.name?.toLowerCase() === nameLower
    );
    if (match) return match.id;
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);
  return null;
}

async function sendSlackDM(
  slackToken: string,
  email: string,
  blocks: any[],
  fallbackText: string,
  personName?: string
): Promise<{ ok: boolean; error?: string }> {
  const lookupRes = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${slackToken}` } }
  );
  const lookupData = await lookupRes.json();

  let slackUserId: string | null = null;
  if (lookupData.ok) {
    slackUserId = lookupData.user.id;
  } else if (personName) {
    slackUserId = await findSlackUserByName(slackToken, personName);
  }

  if (!slackUserId) {
    return {
      ok: false,
      error: `Usuário não encontrado no Slack para ${email}${personName ? ` nem pelo nome "${personName}"` : ""}`,
    };
  }

  const msgRes = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${slackToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: slackUserId,
      text: fallbackText,
      blocks,
    }),
  });
  const msgData = await msgRes.json();
  if (!msgData.ok) {
    return { ok: false, error: `Erro ao enviar DM Slack: ${msgData.error}` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Always reply 200 (do not leak whether the email exists)
  const safeOk = () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const rawEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return safeOk();
    }

    // Determine redirect URL — never trust localhost / http
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
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Find person by email
    const { data: person } = await adminClient
      .from("people")
      .select("id, nome, email, ativo")
      .ilike("email", rawEmail)
      .eq("ativo", true)
      .maybeSingle();

    if (!person) {
      console.log("Reset Slack: person not found for", rawEmail);
      return safeOk();
    }

    // Confirm auth user exists
    const { data: usersData } = await adminClient.auth.admin.listUsers();
    const authUser = usersData?.users?.find(
      (u: any) => (u.email || "").toLowerCase() === person.email.toLowerCase()
    );
    if (!authUser) {
      console.log("Reset Slack: no auth user for", person.email);
      return safeOk();
    }

    // Generate recovery link with explicit redirectTo so it doesn't fall back to Site URL (localhost)
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: person.email,
      options: { redirectTo },
    });
    if (linkError) {
      console.error("generateLink error:", linkError);
      return safeOk();
    }
    const recoveryLink = linkData?.properties?.action_link;
    console.log("Reset Slack: link generated for", person.email, "redirectTo=", redirectTo);

    // Send DM
    const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
    let dmStatus: "sent" | "failed" | "skipped_no_token" = "skipped_no_token";
    let dmError: string | undefined;

    if (slackToken && recoveryLink) {
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

      const result = await sendSlackDM(
        slackToken,
        person.email,
        blocks,
        `Olá ${person.nome}! Acesse ${recoveryLink} para redefinir sua senha.`,
        person.nome
      );
      dmStatus = result.ok ? "sent" : "failed";
      dmError = result.error;
      if (!result.ok) console.error("Slack DM failed:", result.error);
    }

    // Audit log
    await adminClient.from("audit_logs").insert({
      entidade: "auth",
      entidade_id: person.id,
      acao: "USER_PASSWORD_RESET_SLACK",
      actor_id: person.id,
      payload: {
        target_email: person.email,
        target_name: person.nome,
        dm_status: dmStatus,
        dm_error: dmError,
      },
    });

    // Admin channel notification
    const statusLabel =
      dmStatus === "sent"
        ? "✅ DM enviada"
        : dmStatus === "failed"
        ? `⚠️ falha DM (${dmError ?? "erro"})`
        : "⚠️ SLACK_BOT_TOKEN ausente";
    sendSlackNotification(
      `🔑 *Reset de senha solicitado* — *${person.nome}* (${person.email}) — ${statusLabel}`
    );

    return safeOk();
  } catch (e: any) {
    console.error("send-password-reset-slack error:", e);
    return safeOk();
  }
});
