// Notifica colaborador recém-aprovado via DM no Slack e email (Resend),
// com link de acesso ao app. Idempotente por person_id (consulta audit_logs).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") || "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const APP_URL = Deno.env.get("PUBLIC_APP_URL")?.replace(/\/$/, "") || "https://ferias-sync.lovable.app";

async function lookupSlackByEmail(email: string): Promise<string | null> {
  if (!SLACK_BOT_TOKEN || !email) return null;
  try {
    const r = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const d = await r.json();
    if (d.ok && d.user?.id) return d.user.id as string;
  } catch (e: any) {
    console.error("[notify-approved] lookupByEmail err:", e?.message);
  }
  return null;
}

async function postSlackDM(slackUserId: string, text: string, blocks: any[]) {
  try {
    const open = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ users: slackUserId }),
    }).then((r) => r.json());
    if (!open.ok || !open.channel?.id) return { ok: false, error: open.error || "open_failed" };
    const post = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: open.channel.id, text, blocks }),
    }).then((r) => r.json());
    return { ok: !!post.ok, error: post.error };
  } catch (e: any) {
    return { ok: false, error: e?.message || "exception" };
  }
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return { ok: false, error: "no_resend_key" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Férias UXTD <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      return { ok: false, error: `${r.status}:${txt.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "exception" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { person_id, force } = await req.json();
    if (!person_id) {
      return new Response(JSON.stringify({ error: "person_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Idempotência
    if (!force) {
      const { data: prev } = await admin
        .from("audit_logs")
        .select("id")
        .eq("entidade", "people")
        .eq("entidade_id", person_id)
        .eq("acao", "NOTIFY_APPROVED")
        .limit(1);
      if (prev && prev.length > 0) {
        return new Response(JSON.stringify({ skipped: true, reason: "already_notified" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: person, error: pErr } = await admin
      .from("people")
      .select("id, nome, email, slack_user_id")
      .eq("id", person_id)
      .maybeSingle();

    if (pErr || !person) {
      return new Response(JSON.stringify({ error: "person_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, any> = {};

    // ---------- Slack DM ----------
    let slackId: string | null = person.slack_user_id || null;
    if (!slackId && person.email) {
      slackId = await lookupSlackByEmail(person.email);
    }
    if (slackId) {
      const completeUrl = `${APP_URL}/complete-profile`;
      const blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🎉 *Boas-vindas, ${person.nome}!*\n\nSeu cadastro foi aprovado no *Férias UXTD*. Os biscoitos e pontos que você já ganhou estão creditados no seu painel.`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Para liberar seu acesso, falta apenas *completar seu perfil* (data de nascimento, contrato e time):\n\n<${completeUrl}|🚀 Completar meu perfil>`,
          },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: "Você também pode acessar diretamente pelo email cadastrado." }],
        },
      ];
      const r = await postSlackDM(
        slackId,
        `Seu cadastro foi aprovado! Complete seu perfil em ${completeUrl}`,
        blocks
      );
      results.slack = r;
    } else {
      results.slack = { ok: false, error: "no_slack_id" };
    }

    // ---------- Email (magic/invite link) ----------
    if (person.email) {
      try {
        // Tenta convite. Se já existe, gera magic link.
        let actionLink: string | undefined;
        const redirectTo = `${APP_URL}/complete-profile`;

        const inviteRes = await admin.auth.admin.inviteUserByEmail(person.email, { redirectTo });
        if (!inviteRes.error && inviteRes.data?.user) {
          // garantir profile link
          await admin.from("profiles").upsert(
            { user_id: inviteRes.data.user.id, person_id: person.id },
            { onConflict: "user_id" }
          );
          // O inviteUserByEmail já manda email pelo Supabase; ainda assim mandamos email custom abaixo.
          const link = await admin.auth.admin.generateLink({
            type: "magiclink",
            email: person.email,
            options: { redirectTo },
          });
          actionLink = link.data?.properties?.action_link;
        } else {
          // Já existe — gera magic link
          const link = await admin.auth.admin.generateLink({
            type: "magiclink",
            email: person.email,
            options: { redirectTo },
          });
          if (!link.error) actionLink = link.data?.properties?.action_link;
        }

        const url = actionLink || `${APP_URL}/auth`;
        const slackWarning = !slackId
          ? `<div style="margin-top:16px;padding:12px 16px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;color:#78350f;font-size:13px;">
              <strong>Atenção:</strong> não localizamos seu usuário no Slack vinculado a este email.
              Você continuará recebendo notificações por email; se quiser também receber por DM no Slack,
              procure um administrador para vincular seu usuário.
            </div>`
          : '';
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #111;">🎉 Seu cadastro foi aprovado!</h2>
            <p>Olá <strong>${person.nome}</strong>,</p>
            <p>Seu cadastro no <strong>Férias UXTD</strong> foi aprovado. Os biscoitos e pontos que você já recebeu estão no seu painel.</p>
            <p>Para liberar o acesso, complete seu perfil (data de nascimento, contrato e time):</p>
            <p style="margin: 24px 0;">
              <a href="${url}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">
                🚀 Completar meu perfil
              </a>
            </p>
            <p style="color:#666;font-size:13px;">Se o botão não funcionar, copie e cole no navegador:<br/>${url}</p>
            ${slackWarning}
          </div>
        `;
        const er = await sendEmail(person.email, "🎉 Bem-vindo(a) ao Férias UXTD — complete seu perfil", html);
        results.email = er;
      } catch (e: any) {
        results.email = { ok: false, error: e?.message || "exception" };
      }
    } else {
      results.email = { ok: false, error: "no_email" };
    }

    await admin.from("audit_logs").insert({
      entidade: "people",
      entidade_id: person_id,
      acao: "NOTIFY_APPROVED",
      actor_id: person_id,
      payload: { results, slack_used: !!slackId },
    });

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[notify-approved-collaborator] error:", e);
    return new Response(JSON.stringify({ error: e?.message || "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
