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
    console.error("Slack notification failed:", e);
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
  // Lookup Slack user by email
  const lookupRes = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    {
      headers: { Authorization: `Bearer ${slackToken}` },
    }
  );
  const lookupData = await lookupRes.json();

  let slackUserId: string | null = null;

  if (lookupData.ok) {
    slackUserId = lookupData.user.id;
  } else if (personName) {
    console.log(`Email lookup failed for ${email}, trying name lookup for "${personName}"...`);
    slackUserId = await findSlackUserByName(slackToken, personName);
    if (slackUserId) {
      console.log(`Found Slack user by name "${personName}": ${slackUserId}`);
    }
  }

  if (!slackUserId) {
    return { ok: false, error: `Usuário não encontrado no Slack para ${email}${personName ? ` nem pelo nome "${personName}"` : ""}` };
  }

  // Send DM directly using user ID as channel (no conversations.open needed)
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

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate caller
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerUserId = claimsData.claims.sub;

    // Check if caller is admin/director
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("person_id")
      .eq("user_id", callerUserId)
      .single();

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: "Perfil não encontrado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerPerson } = await adminClient
      .from("people")
      .select("papel, is_admin, nome")
      .eq("id", callerProfile.person_id)
      .single();

    if (!callerPerson) {
      return new Response(
        JSON.stringify({ error: "Dados do usuário não encontrados" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, person_id, change_type, target_name, target_email, details, invite_method } = body;

    const isCallerDirectorOrAdmin =
      callerPerson.papel === "DIRETOR" ||
      callerPerson.papel === "ADMIN" ||
      callerPerson.is_admin;

    const isCallerManager = callerPerson.papel === "GESTOR";

    // For send_invite, allow managers too; for all other actions, require director/admin
    if (action === "send_invite") {
      if (!isCallerDirectorOrAdmin && !isCallerManager) {
        return new Response(
          JSON.stringify({ error: "Apenas gestores, diretores ou admins podem enviar convites" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      if (!isCallerDirectorOrAdmin) {
        return new Response(
          JSON.stringify({ error: "Apenas diretores/admins podem realizar esta ação" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!action || !person_id) {
      return new Response(
        JSON.stringify({ error: "action e person_id são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get target person's email and role
    const { data: targetPerson } = await adminClient
      .from("people")
      .select("email, nome, papel")
      .eq("id", person_id)
      .single();

    if (!targetPerson) {
      return new Response(
        JSON.stringify({ error: "Pessoa não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reset_password") {
      // Find auth user by email
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(
        (u: any) => u.email === targetPerson.email
      );

      if (!authUser) {
        return new Response(
          JSON.stringify({ error: "Usuário de autenticação não encontrado para este email" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate recovery link
      const { data: linkData, error: linkError } =
        await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: targetPerson.email,
        });

      if (linkError) {
        throw linkError;
      }

      // Audit log
      await adminClient.from("audit_logs").insert({
        entidade: "auth",
        entidade_id: person_id,
        acao: "ADMIN_PASSWORD_RESET",
        actor_id: callerProfile.person_id,
        payload: { target_email: targetPerson.email, target_name: targetPerson.nome },
      });

      // Slack notification (fire-and-forget)
      sendSlackNotification(
        `🔑 *Reset de Senha via Admin*\nAdmin *${callerPerson.nome}* enviou reset de senha para *${targetPerson.nome}* (${targetPerson.email})`
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: `Email de recuperação de senha enviado para ${targetPerson.email}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "clear_identities") {
      // Find auth user by email
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(
        (u: any) => u.email === targetPerson.email
      );

      if (!authUser) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Nenhum usuário de autenticação encontrado — já está limpo",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Delete the auth user (cascades to profiles)
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(
        authUser.id
      );

      if (deleteError) {
        throw deleteError;
      }

      // Audit log
      await adminClient.from("audit_logs").insert({
        entidade: "auth",
        entidade_id: person_id,
        acao: "ADMIN_CLEAR_AUTH",
        actor_id: callerProfile.person_id,
        payload: {
          target_email: targetPerson.email,
          target_name: targetPerson.nome,
          deleted_auth_user_id: authUser.id,
        },
      });

      // Slack notification (fire-and-forget)
      sendSlackNotification(
        `🛡️ *Autenticação Zerada via Admin*\nAdmin *${callerPerson.nome}* zerou a autenticação de *${targetPerson.nome}* (${targetPerson.email})`
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: `Autenticação de ${targetPerson.nome} foi zerada. O usuário poderá se recadastrar.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "send_invite") {
      // Determine effective invite method
      const effectiveMethod: string = invite_method || "both";

      // Check if email already has an auth user
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const existingAuthUser = authUsers?.users?.find(
        (u: any) => u.email === targetPerson.email
      );

      if (existingAuthUser) {
        return new Response(
          JSON.stringify({ error: "Este email já possui uma conta de autenticação ativa" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results: string[] = [];
      let authUserId: string | undefined;

      // --- EMAIL (inviteUserByEmail) ---
      if (effectiveMethod === "email" || effectiveMethod === "both") {
        const { data: inviteData, error: inviteError } =
          await adminClient.auth.admin.inviteUserByEmail(targetPerson.email);

        if (inviteError) {
          throw inviteError;
        }

        authUserId = inviteData?.user?.id;

        // Create profile linking auth user to person
        if (inviteData?.user) {
          await adminClient.from("profiles").upsert({
            user_id: inviteData.user.id,
            person_id: person_id,
          }, { onConflict: "user_id" });
        }

        results.push("email");
      }

      // --- SLACK-ONLY: use generateLink instead of inviteUserByEmail ---
      if (effectiveMethod === "slack") {
        // Generate a signup/invite link without sending email
        const { data: linkData, error: linkError } =
          await adminClient.auth.admin.generateLink({
            type: "invite",
            email: targetPerson.email,
          });

        if (linkError) {
          throw linkError;
        }

        authUserId = linkData?.user?.id;

        // Create profile linking auth user to person
        if (linkData?.user) {
          await adminClient.from("profiles").upsert({
            user_id: linkData.user.id,
            person_id: person_id,
          }, { onConflict: "user_id" });
        }
      }

      // --- SLACK DM ---
      if (effectiveMethod === "slack" || effectiveMethod === "both") {
        const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
        if (!slackToken) {
          if (effectiveMethod === "slack") {
            return new Response(
              JSON.stringify({ error: "SLACK_BOT_TOKEN não configurado. Não é possível enviar convite via Slack." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          // If 'both', email was already sent, just skip Slack
          results.push("slack_skipped_no_token");
        } else {
          // Generate the invite link for the DM
          let inviteLink: string | undefined;

          // For 'both', we need to generate a separate link for the DM
          // For 'slack', we already generated the link above
          const { data: dmLinkData, error: dmLinkError } =
            await adminClient.auth.admin.generateLink({
              type: "invite",
              email: targetPerson.email,
            });

          if (!dmLinkError && dmLinkData?.properties?.action_link) {
            inviteLink = dmLinkData.properties.action_link;
          }

          const blocks = [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `👋 Olá, *${targetPerson.nome}*!\n\nVocê foi convidado(a) por *${callerPerson.nome}* para criar sua conta no sistema de gestão de férias.`,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: inviteLink
                  ? `Clique no link abaixo para configurar sua senha e acessar o sistema:\n\n<${inviteLink}|🔗 Criar minha conta>`
                  : "Verifique seu email para o link de criação de conta.",
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: "📩 Este convite foi enviado pelo sistema de administração.",
                },
              ],
            },
          ];

          const dmResult = await sendSlackDM(
            slackToken,
            targetPerson.email,
            blocks,
            `Olá ${targetPerson.nome}! Você foi convidado(a) para criar sua conta. ${inviteLink || "Verifique seu email."}`,
            targetPerson.nome
          );

          if (dmResult.ok) {
            results.push("slack");
          } else {
            if (effectiveMethod === "slack") {
              return new Response(
                JSON.stringify({ error: dmResult.error }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            results.push(`slack_failed: ${dmResult.error}`);
          }
        }
      }

      // Audit log
      await adminClient.from("audit_logs").insert({
        entidade: "auth",
        entidade_id: person_id,
        acao: "ADMIN_SEND_INVITE",
        actor_id: callerProfile.person_id,
        payload: {
          target_email: targetPerson.email,
          target_name: targetPerson.nome,
          invited_auth_user_id: authUserId,
          invite_method: effectiveMethod,
          results,
        },
      });

      // Channel notification (always)
      const methodLabel = effectiveMethod === "both" ? "Email + Slack" : effectiveMethod === "slack" ? "Slack DM" : "Email";
      sendSlackNotification(
        `📩 *Convite Enviado (${methodLabel})* — Admin *${callerPerson.nome}* enviou convite de criação de conta para *${targetPerson.nome}* (${targetPerson.email})`
      );

      const successParts: string[] = [];
      if (results.includes("email")) successParts.push("por email");
      if (results.includes("slack")) successParts.push("via Slack DM");
      if (effectiveMethod === "slack" && !results.includes("slack_failed")) {
        successParts.push("via Slack DM");
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Convite enviado ${successParts.length > 0 ? successParts.join(" e ") : ""} para ${targetPerson.email}`,
          results,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "notify_admin_change") {

      const emojiMap: Record<string, string> = {
        deactivation: "🚫",
        reactivation: "✅",
        role_change: "🔄",
        deletion: "🗑️",
      };
      const titleMap: Record<string, string> = {
        deactivation: "Usuário Desativado",
        reactivation: "Usuário Reativado",
        role_change: "Mudança de Papel",
        deletion: "Usuário Excluído",
      };

      const emoji = emojiMap[change_type] || "ℹ️";
      const title = titleMap[change_type] || "Ação Administrativa";
      let message = `${emoji} *${title}*\nAdmin *${callerPerson.nome}*`;

      if (change_type === "role_change" && details) {
        message += ` alterou papel de *${target_name || targetPerson.nome}* de ${details.old_role} para ${details.new_role}`;
      } else if (change_type === "deactivation") {
        message += ` desativou *${target_name || targetPerson.nome}* (${target_email || targetPerson.email})`;
      } else if (change_type === "reactivation") {
        message += ` reativou *${target_name || targetPerson.nome}* (${target_email || targetPerson.email})`;
      } else if (change_type === "deletion") {
        message += ` excluiu *${target_name || targetPerson.nome}* (${target_email || targetPerson.email})`;
      }

      // Audit log
      await adminClient.from("audit_logs").insert({
        entidade: "people",
        entidade_id: person_id,
        acao: `ADMIN_${(change_type || "CHANGE").toUpperCase()}`,
        actor_id: callerProfile.person_id,
        payload: {
          change_type,
          target_name: target_name || targetPerson.nome,
          target_email: target_email || targetPerson.email,
          details,
        },
      });

      sendSlackNotification(message);

      return new Response(
        JSON.stringify({ success: true, message: "Notificação enviada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida. Use reset_password, clear_identities, send_invite ou notify_admin_change" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in admin-auth-management:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
