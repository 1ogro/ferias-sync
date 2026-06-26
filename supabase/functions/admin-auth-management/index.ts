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

function normalizeName(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

async function findSlackUserByName(
  slackToken: string,
  personName: string
): Promise<{ id: string | null; reason: "exact" | "multiple_matches" | "not_found" | "error" }> {
  const target = normalizeName(personName);
  if (!target) return { id: null, reason: "not_found" };

  const matches: { id: string; label: string }[] = [];
  let cursor = "";
  do {
    const url = `https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${slackToken}` },
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("users.list error:", data.error);
      return { id: null, reason: "error" };
    }
    for (const u of data.members ?? []) {
      if (u.deleted || u.is_bot || u.id === "USLACKBOT") continue;
      const candidates = [
        u.name,
        u.real_name,
        u.profile?.display_name,
        u.profile?.real_name,
        u.profile?.display_name_normalized,
        u.profile?.real_name_normalized,
      ].map(normalizeName).filter(Boolean);
      if (candidates.some((c) => c === target)) {
        matches.push({ id: u.id, label: u.profile?.real_name || u.real_name || u.name });
      }
    }
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);

  if (matches.length === 1) return { id: matches[0].id, reason: "exact" };
  if (matches.length > 1) {
    console.warn(`Multiple Slack matches for "${personName}":`, matches.map((m) => `${m.label} (${m.id})`).join(", "));
    return { id: null, reason: "multiple_matches" };
  }
  return { id: null, reason: "not_found" };
}

async function sendSlackDM(
  slackToken: string,
  email: string,
  blocks: any[],
  fallbackText: string,
  personName?: string,
  knownSlackUserId?: string | null,
  extraEmails: (string | null | undefined)[] = []
): Promise<{ ok: boolean; error?: string; slackUserId?: string; lookupMethod?: string; ts?: string }> {
  let slackUserId: string | null = null;
  let lookupMethod = "";

  // 1) Direct slack_user_id (stored on people / found via Slack approval flow)
  if (knownSlackUserId && knownSlackUserId.trim().length > 0) {
    slackUserId = knownSlackUserId.trim();
    lookupMethod = "slack_user_id";
  }

  // 2) Try lookupByEmail across all candidate emails (corporate + personal login email)
  if (!slackUserId) {
    const tried: string[] = [];
    const candidates = [email, ...extraEmails]
      .map((e) => (e || "").trim().toLowerCase())
      .filter((e, i, arr) => e && arr.indexOf(e) === i);
    for (const candidate of candidates) {
      tried.push(candidate);
      const lookupRes = await fetch(
        `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(candidate)}`,
        { headers: { Authorization: `Bearer ${slackToken}` } }
      );
      const lookupData = await lookupRes.json();
      if (lookupData.ok) {
        slackUserId = lookupData.user.id;
        lookupMethod = `email:${candidate}`;
        break;
      }
      console.warn(`Slack lookupByEmail failed for ${candidate}: ${lookupData.error}`);
    }

    // 3) Fall back to name match
    if (!slackUserId && personName) {
      const byName = await findSlackUserByName(slackToken, personName);
      if (byName.id) {
        slackUserId = byName.id;
        lookupMethod = "name";
      } else if (byName.reason === "multiple_matches") {
        return {
          ok: false,
          error: `Vários usuários no Slack têm o nome "${personName}". Cadastre o email correto no Slack ou use o método de Email.`,
        };
      }
    }

    if (!slackUserId) {
      return {
        ok: false,
        error: `Usuário não encontrado no Slack (tentei: ${tried.join(", ") || "—"}${personName ? ` e nome "${personName}"` : ""}). Confirme o email cadastrado no Slack ou use o método de Email.`,
      };
    }
  }

  console.log(`Slack DM target resolved via ${lookupMethod} -> ${slackUserId}`);

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
    return { ok: false, error: `Erro ao enviar DM Slack: ${msgData.error}`, slackUserId, lookupMethod };
  }

  return { ok: true, slackUserId, lookupMethod, ts: msgData.ts };
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

    // Get target person's email and role (may be missing for deletion notifications)
    // Get target person's email and role (may be missing for deletion notifications)
    const { data: targetPerson } = await adminClient
      .from("people")
      .select("email, nome, papel, slack_user_id")
      .eq("id", person_id)
      .maybeSingle();

    const hasTargetFallback = !!(target_name || target_email);
    if (!targetPerson && !(action === "notify_admin_change" && hasTargetFallback)) {
      return new Response(
        JSON.stringify({ error: "Pessoa não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const effectiveTarget = targetPerson || {
      email: target_email || "",
      nome: target_name || "",
      papel: "",
    };

    if (action === "reset_password") {
      const resetMethod: string = invite_method || "email";

      // Find auth user by email
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const authUser = authUsers?.users?.find(
        (u: any) => u.email === targetPerson.email
      );

      if (!authUser) {
        return new Response(
          JSON.stringify({ error: `${targetPerson.nome} ainda não criou uma conta. Envie um convite (botão de envelope) em vez de redefinir senha.` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate recovery link — build link on app domain using hashed_token
      // so that Slack/email prefetch doesn't consume the one-time token.
      const appRedirect =
        Deno.env.get("PUBLIC_APP_URL") ??
        "https://ferias-sync.lovable.app/reset-password";
      const { data: linkData, error: linkError } =
        await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: targetPerson.email,
          options: { redirectTo: appRedirect },
        });

      if (linkError) {
        throw linkError;
      }

      const hashedToken = linkData?.properties?.hashed_token;
      const sep = appRedirect.includes("?") ? "&" : "?";
      const recoveryLink = hashedToken
        ? `${appRedirect}${sep}token_hash=${encodeURIComponent(hashedToken)}&type=recovery`
        : linkData?.properties?.action_link;
      const results: string[] = [];
      let dmResultOuter: Awaited<ReturnType<typeof sendSlackDM>> | null = null;

      // --- EMAIL ---
      if (resetMethod === "email" || resetMethod === "both") {
        // generateLink with type "recovery" already sends the email
        results.push("email");
      }

      // --- SLACK DM ---
      if (resetMethod === "slack" || resetMethod === "both") {
        const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
        if (!slackToken) {
          if (resetMethod === "slack") {
            return new Response(
              JSON.stringify({ error: "SLACK_BOT_TOKEN não configurado. Não é possível enviar reset via Slack." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          results.push("slack_skipped_no_token");
        } else {
          const blocks = [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `🔑 Olá, *${targetPerson.nome}*!\n\nFoi solicitada a recuperação da sua senha por *${callerPerson.nome}*.`,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: recoveryLink
                  ? `Clique no link abaixo para redefinir sua senha:\n\n<${recoveryLink}|🔗 Redefinir minha senha>`
                  : "Verifique seu email para o link de recuperação de senha.",
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

          // Also try the user's auth (login) email — may be a personal email registered in Slack
          let loginEmail: string | null = null;
          try {
            const { data: profRow } = await adminClient
              .from("profiles").select("user_id").eq("person_id", person_id).maybeSingle();
            if (profRow?.user_id) {
              const { data: authUserRes } = await adminClient.auth.admin.getUserById(profRow.user_id);
              loginEmail = authUserRes?.user?.email ?? null;
            }
          } catch (_) { /* ignore */ }

          const dmResult = await sendSlackDM(
            slackToken,
            targetPerson.email,
            blocks,
            `Olá ${targetPerson.nome}! Foi solicitada a recuperação da sua senha. ${recoveryLink || "Verifique seu email."}`,
            targetPerson.nome,
            (targetPerson as any).slack_user_id ?? null,
            [loginEmail]
          );
          dmResultOuter = dmResult;

          if (dmResult.ok) {
            results.push("slack");
          } else {
            if (resetMethod === "slack") {
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
      const methodLabel = resetMethod === "both" ? "Email + Slack" : resetMethod === "slack" ? "Slack DM" : "Email";
      await adminClient.from("audit_logs").insert({
        entidade: "auth",
        entidade_id: person_id,
        acao: "ADMIN_PASSWORD_RESET",
        actor_id: callerProfile.person_id,
        payload: {
          target_email: targetPerson.email,
          target_name: targetPerson.nome,
          method: resetMethod,
          results,
          slack_user_id: dmResultOuter?.slackUserId ?? null,
          slack_lookup_method: dmResultOuter?.lookupMethod ?? null,
          slack_dm_ts: dmResultOuter?.ts ?? null,
          slack_dm_error: dmResultOuter?.error ?? null,
        },
      });

      // Slack channel notification (fire-and-forget)
      sendSlackNotification(
        `🔑 *Reset de Senha (${methodLabel})* — Admin *${callerPerson.nome}* enviou reset de senha para *${targetPerson.nome}* (${targetPerson.email})`
      );

      const successParts: string[] = [];
      if (results.includes("email")) successParts.push("por email");
      if (results.includes("slack")) successParts.push("via Slack DM");

      return new Response(
        JSON.stringify({
          success: true,
          message: `Link de recuperação enviado ${successParts.join(" e ")} para ${targetPerson.nome}`,
          results,
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

      let deletedAuthUserId: string | null = null;

      if (authUser) {
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(
          authUser.id
        );
        if (deleteError) {
          throw deleteError;
        }
        deletedAuthUserId = authUser.id;
      }

      // Always remove any orphan profile linked to this person
      const { data: deletedProfiles } = await adminClient
        .from("profiles")
        .delete()
        .eq("person_id", person_id)
        .select("id");

      const orphanCleaned = (deletedProfiles?.length ?? 0) > 0 && !deletedAuthUserId;

      // Audit log
      await adminClient.from("audit_logs").insert({
        entidade: "auth",
        entidade_id: person_id,
        acao: "ADMIN_CLEAR_AUTH",
        actor_id: callerProfile.person_id,
        payload: {
          target_email: targetPerson.email,
          target_name: targetPerson.nome,
          deleted_auth_user_id: deletedAuthUserId,
          deleted_profiles: deletedProfiles?.length ?? 0,
          orphan_cleanup_only: orphanCleaned,
        },
      });

      if (!authUser && (deletedProfiles?.length ?? 0) === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Nenhum usuário de autenticação encontrado — já está limpo",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Slack notification (fire-and-forget)
      sendSlackNotification(
        `🛡️ *Autenticação Zerada via Admin*\nAdmin *${callerPerson.nome}* zerou a autenticação de *${targetPerson.nome}* (${targetPerson.email})${orphanCleaned ? " (perfil órfão removido)" : ""}`
      );

      return new Response(
        JSON.stringify({
          success: true,
          message: orphanCleaned
            ? `Perfil órfão de ${targetPerson.nome} removido. Agora é possível enviar um novo convite.`
            : `Autenticação de ${targetPerson.nome} foi zerada. O usuário poderá se recadastrar.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }



    if (action === "send_invite") {
      // Determine effective invite method
      const effectiveMethod: string = invite_method || "both";

      // Check if email already has an auth user with confirmed identity
      const { data: authUsers } = await adminClient.auth.admin.listUsers();
      const existingAuthUser = authUsers?.users?.find(
        (u: any) => u.email === targetPerson.email
      );

      // Only block if user has actually confirmed (has identities with confirmed login)
      const hasConfirmedIdentity = existingAuthUser?.email_confirmed_at && 
        existingAuthUser?.identities?.some((i: any) => i.provider !== 'email' || i.last_sign_in_at);

      if (existingAuthUser && hasConfirmedIdentity) {
        return new Response(
          JSON.stringify({ error: "Este email já possui uma conta de autenticação ativa" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If there's an unconfirmed/invited user, delete it first so we can re-invite
      if (existingAuthUser && !hasConfirmedIdentity) {
        await adminClient.auth.admin.deleteUser(existingAuthUser.id);
        // Also clean up any orphaned profile
        await adminClient.from("profiles").delete().eq("user_id", existingAuthUser.id);
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
      const inviteRedirect =
        Deno.env.get("PUBLIC_APP_URL")?.replace(/\/reset-password$/, "/setup-profile") ??
        "https://ferias-sync.lovable.app/setup-profile";

      if (effectiveMethod === "slack") {
        // Generate a signup/invite link without sending email
        const { data: linkData, error: linkError } =
          await adminClient.auth.admin.generateLink({
            type: "invite",
            email: targetPerson.email,
            options: { redirectTo: inviteRedirect },
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
              options: { redirectTo: inviteRedirect },
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
        message += ` alterou papel de *${target_name || effectiveTarget.nome}* de ${details.old_role} para ${details.new_role}`;
      } else if (change_type === "deactivation") {
        message += ` desativou *${target_name || effectiveTarget.nome}* (${target_email || effectiveTarget.email})`;
      } else if (change_type === "reactivation") {
        message += ` reativou *${target_name || effectiveTarget.nome}* (${target_email || effectiveTarget.email})`;
      } else if (change_type === "deletion") {
        const reassignInfo = details?.reassigned_to
          ? `\n🔄 Equipe (${details.subordinates || 0} pessoa(s)) reatribuída para *${details.reassigned_to}*`
          : "";
        message += ` excluiu *${target_name || effectiveTarget.nome}* (${target_email || effectiveTarget.email})${reassignInfo}`;
      }

      // Audit log
      await adminClient.from("audit_logs").insert({
        entidade: "people",
        entidade_id: person_id,
        acao: `ADMIN_${(change_type || "CHANGE").toUpperCase()}`,
        actor_id: callerProfile.person_id,
        payload: {
          change_type,
          target_name: target_name || effectiveTarget.nome,
          target_email: target_email || effectiveTarget.email,
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
