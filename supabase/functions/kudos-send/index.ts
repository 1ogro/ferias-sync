// kudos-send — registra um shout-out entre colegas, soma pontos e opcionalmente posta no canal Slack.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findRecentDuplicate, DEDUP_WINDOW_SECONDS, type KudoLike } from "./lib.ts";

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
    const { to_person_id, to_person_ids, message, category = "teamwork", post_to_channel } = body || {};

    // Normaliza destinatários (aceita string única ou array)
    let recipients: string[] = [];
    if (Array.isArray(to_person_ids)) recipients = to_person_ids.filter((x: any) => typeof x === "string");
    else if (typeof to_person_id === "string") recipients = [to_person_id];
    recipients = Array.from(new Set(recipients.filter((id) => id && id !== fromPersonId)));

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: "to_person_id(s) required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (recipients.length > 10) {
      return new Response(JSON.stringify({ error: "max 10 recipients" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!message || typeof message !== "string" || message.length < 1 || message.length > 500) {
      return new Response(JSON.stringify({ error: "message must be 1-500 chars" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return new Response(JSON.stringify({ error: "invalid category" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: from } = await admin.from("people").select("nome, papel").eq("id", fromPersonId).maybeSingle();

    // Múltiplos destinatários: só GESTOR/DIRETOR e apenas categoria delivery
    if (recipients.length > 1) {
      if (category !== "delivery") {
        return new Response(JSON.stringify({ error: "multi-recipient allowed only for category 'delivery'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!from || (from.papel !== "GESTOR" && from.papel !== "DIRETOR")) {
        return new Response(JSON.stringify({ error: "multi-recipient allowed only for GESTOR/DIRETOR" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Valida destinatários ativos
    const { data: activeRows } = await admin.from("people").select("id, nome, ativo").in("id", recipients);
    const activeMap = new Map<string, { id: string; nome: string }>();
    for (const r of (activeRows || []) as Array<{ id: string; nome: string; ativo: boolean }>) {
      if (r.ativo) activeMap.set(r.id, { id: r.id, nome: r.nome });
    }
    const validRecipients = recipients.filter((id) => activeMap.has(id));
    if (validRecipients.length === 0) {
      return new Response(JSON.stringify({ error: "Recipients not found or inactive" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const channelToPost = (typeof post_to_channel === "string" && post_to_channel.trim()) ? post_to_channel.trim() : null;
    const trimmedMessage = message.trim();

    // Fetch recent kudos from this sender within the dedup window (one query for all recipients)
    const sinceIso = new Date(Date.now() - DEDUP_WINDOW_SECONDS * 1000).toISOString();
    const { data: recentRows } = await admin
      .from("kudos")
      .select("id, from_person_id, to_person_id, message, category, created_at")
      .eq("from_person_id", fromPersonId)
      .in("to_person_id", validRecipients)
      .gte("created_at", sinceIso);
    const recent: KudoLike[] = (recentRows || []) as any;

    const insertedKudos: any[] = [];
    const dedupedKudos: any[] = [];
    const dedupedRecipients: string[] = [];
    for (const to_person_id of validRecipients) {
      const dup = findRecentDuplicate(
        { from_person_id: fromPersonId, to_person_id, message: trimmedMessage, category },
        recent,
      );
      if (dup) {
        console.log("[kudos-send] deduped", { from: fromPersonId, to: to_person_id, existing: dup.id });
        dedupedKudos.push(dup);
        dedupedRecipients.push(to_person_id);
        continue;
      }
      const { data: kudo, error: insErr } = await admin.from("kudos").insert({
        from_person_id: fromPersonId,
        to_person_id,
        message: trimmedMessage,
        category,
        slack_channel_posted: channelToPost,
      }).select().single();
      if (insErr || !kudo) {
        console.error("[kudos-send] insert failed for", to_person_id, insErr);
        continue;
      }
      insertedKudos.push(kudo);
      await admin.rpc("award_points", { p_person_id: to_person_id, p_points: 10, p_reason: "kudo_received", p_source_id: kudo.id });
      await admin.rpc("award_points", { p_person_id: fromPersonId, p_points: 2, p_reason: "kudo_given", p_source_id: kudo.id });
    }

    if (insertedKudos.length === 0 && dedupedKudos.length === 0) {
      return new Response(JSON.stringify({ error: "insert failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If everything was deduped, short-circuit — no channel post, no notifications.
    if (insertedKudos.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        deduped: true,
        kudos: dedupedKudos,
        count: 0,
        deduped_count: dedupedKudos.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    if (channelToPost) {
      const postedRecipients = insertedKudos
        .map((k) => k.to_person_id as string)
        .filter((id) => id);
      const names = postedRecipients.map((id) => activeMap.get(id)?.nome).filter(Boolean) as string[];
      if (names.length === 1) {
        await postToChannel(channelToPost, from?.nome || "Alguém", names[0], category, trimmedMessage);
      } else if (names.length > 1) {
        const label = CATEGORY_LABEL[category] || "🎉";
        const listed = names.map((n) => `*${n}*`).join(", ");
        const text = `${label} *${from?.nome || "Alguém"}* deu kudos para ${listed}\n> ${trimmedMessage}`;
        await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel: channelToPost, text }),
        }).catch((e) => console.warn("[kudos batch post]", e));
      }
    }

    // Fire-and-forget: uma única invocação agrupada evita DMs duplicadas
    if (insertedKudos.length > 0) {
      const ids = insertedKudos.map((k) => k.id);
      const payload = ids.length === 1 ? { kudo_id: ids[0] } : { kudo_ids: ids };
      admin.functions.invoke("kudos-notify-managers", { body: payload })
        .catch((e: any) => console.error("[kudos-send] notify invoke failed", e?.message));
    }

    return new Response(JSON.stringify({
      ok: true,
      kudos: insertedKudos,
      count: insertedKudos.length,
      deduped_count: dedupedKudos.length,
      deduped: dedupedKudos.length > 0 && insertedKudos.length === 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("kudos-send error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
