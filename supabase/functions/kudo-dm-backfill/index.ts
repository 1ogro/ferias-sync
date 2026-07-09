// One-off backfill helper to (re)send a kudo DM to a recipient by email,
// vincular slack_user_id em people se fornecido, e registrar audit log.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") || "";

const CATEGORY_LABEL: Record<string, string> = {
  teamwork: "🤝 Trabalho em equipe",
  innovation: "💡 Inovação",
  delivery: "🚀 Entrega",
  leadership: "🏆 Liderança",
  customer: "❤️ Foco no cliente",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { kudo_id, lookup_email, slack_user_id, update_person_slack_id } = body as {
      kudo_id: string;
      lookup_email?: string;
      slack_user_id?: string;
      update_person_slack_id?: boolean;
    };
    if (!kudo_id) return json({ error: "kudo_id required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: k } = await admin.from("kudos").select("*").eq("id", kudo_id).maybeSingle();
    if (!k) return json({ error: "kudo not found" }, 404);
    const { data: from } = await admin.from("people").select("nome").eq("id", k.from_person_id).maybeSingle();
    const { data: to } = await admin.from("people").select("id, nome, email, slack_user_id").eq("id", k.to_person_id).maybeSingle();
    if (!to) return json({ error: "recipient not found" }, 404);

    let uid = slack_user_id || to.slack_user_id || null;
    let lookupInfo: any = null;
    if (!uid) {
      const email = lookup_email || to.email;
      const r = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      });
      lookupInfo = await r.json();
      if (lookupInfo.ok && lookupInfo.user?.id) uid = lookupInfo.user.id;
    }
    if (!uid) {
      return json({ ok: false, stage: "lookup", lookup: lookupInfo });
    }

    const openRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ users: uid }),
    });
    const open = await openRes.json();
    if (!open.ok || !open.channel?.id) return json({ ok: false, stage: "open", open });

    const catLabel = CATEGORY_LABEL[k.category] || "🍪";
    const text =
      `🍪 *Você ganhou um biscoito!*\n${catLabel}\nDe: *${from?.nome || "Alguém"}*\n> ${k.message}\n\nVeja seu feed em /engagement`;
    const postRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: open.channel.id, text }),
    });
    const post = await postRes.json();
    if (!post.ok) return json({ ok: false, stage: "post", post });

    await admin.from("audit_logs").insert({
      entidade: "kudos",
      entidade_id: `${k.id}:${to.id}`,
      acao: "KUDOS_RECIPIENT_DM",
      payload: { kudo_id: k.id, recipient_id: to.id, status: "sent", slack_user_id: uid, channel: open.channel.id, ts: post.ts, backfill: true },
    });

    if (update_person_slack_id && (!to.slack_user_id || to.slack_user_id !== uid)) {
      await admin.from("people").update({ slack_user_id: uid, updated_at: new Date().toISOString() }).eq("id", to.id);
    }

    return json({ ok: true, slack_user_id: uid, channel: open.channel.id, ts: post.ts });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
