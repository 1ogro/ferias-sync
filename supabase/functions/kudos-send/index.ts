// kudos-send — registra um shout-out entre colegas, soma pontos e opcionalmente posta no canal Slack.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_CATEGORIES = ["teamwork", "innovation", "delivery", "leadership", "customer"];

const CATEGORY_LABEL: Record<string, string> = {
  teamwork: "🤝 Trabalho em equipe",
  innovation: "💡 Inovação",
  delivery: "🚀 Entrega",
  leadership: "🏆 Liderança",
  customer: "❤️ Foco no cliente",
};

async function postToChannel(channel: string, fromName: string, toName: string, category: string, message: string) {
  const text = `${CATEGORY_LABEL[category] || "🎉"} *${fromName}* deu kudos para *${toName}*\n> ${message}`;
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, text }),
  });
  const data = await res.json();
  if (!data.ok) console.warn("[kudos chat.postMessage]", data);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: prof } = await admin
      .from("profiles").select("person_id").eq("user_id", userData.user.id).maybeSingle();
    if (!prof?.person_id) {
      return new Response(JSON.stringify({ error: "No linked person" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fromPersonId = prof.person_id as string;

    const body = await req.json().catch(() => ({}));
    const { to_person_id, message, category = "teamwork", post_to_channel } = body || {};

    if (!to_person_id || typeof to_person_id !== "string") {
      return new Response(JSON.stringify({ error: "to_person_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!message || typeof message !== "string" || message.length < 1 || message.length > 500) {
      return new Response(JSON.stringify({ error: "message must be 1-500 chars" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return new Response(JSON.stringify({ error: "invalid category" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (to_person_id === fromPersonId) {
      return new Response(JSON.stringify({ error: "Cannot give kudos to yourself" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: from } = await admin.from("people").select("nome").eq("id", fromPersonId).maybeSingle();
    const { data: to } = await admin.from("people").select("nome, ativo").eq("id", to_person_id).maybeSingle();
    if (!to || !to.ativo) {
      return new Response(JSON.stringify({ error: "Recipient not found or inactive" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const channelToPost = (typeof post_to_channel === "string" && post_to_channel.trim()) ? post_to_channel.trim() : null;

    const { data: kudo, error: insErr } = await admin.from("kudos").insert({
      from_person_id: fromPersonId,
      to_person_id,
      message: message.trim(),
      category,
      slack_channel_posted: channelToPost,
    }).select().single();
    if (insErr || !kudo) throw new Error(insErr?.message || "insert failed");

    await admin.rpc("award_points", { p_person_id: to_person_id, p_points: 10, p_reason: "kudo_received", p_source_id: kudo.id });
    await admin.rpc("award_points", { p_person_id: fromPersonId, p_points: 2, p_reason: "kudo_given", p_source_id: kudo.id });

    if (channelToPost) {
      await postToChannel(channelToPost, from?.nome || "Alguém", to.nome, category, message.trim());
    }

    return new Response(JSON.stringify({ ok: true, kudo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("kudos-send error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
