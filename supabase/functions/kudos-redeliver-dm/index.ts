// One-off endpoint: retenta a DM de recibimento para uma lista de kudo_ids.
// Faz backfill do slack_user_id via email/email_pessoal e reenvia o card.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") || "";

const CATEGORY_LABEL: Record<string, string> = {
  teamwork: "🤝 Trabalho em equipe",
  innovation: "💡 Inovação",
  delivery: "🚀 Entrega",
  leadership: "🏆 Liderança",
  customer: "❤️ Foco no cliente",
};

async function resolveSlackId(admin: any, person: any): Promise<{ id: string | null; tried: string[]; err: string | null }> {
  if (person.slack_user_id) return { id: person.slack_user_id, tried: [], err: null };
  const emails = [person.email, person.email_pessoal]
    .map((e: any) => (e || "").trim())
    .filter((e: string, i: number, a: string[]) => e && a.indexOf(e) === i);
  const tried: string[] = [];
  let err: string | null = null;
  for (const email of emails) {
    tried.push(email);
    const r = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const d = await r.json();
    if (d.ok && d.user?.id) {
      await admin.from("people").update({ slack_user_id: d.user.id }).eq("id", person.id);
      return { id: d.user.id, tried, err: null };
    }
    err = d.error || "users_not_found";
  }
  return { id: null, tried, err };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await req.json().catch(() => ({}));
    const kudoIds: string[] = Array.isArray(body?.kudo_ids) ? body.kudo_ids : [];
    if (kudoIds.length === 0) {
      return new Response(JSON.stringify({ error: "kudo_ids required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const results: any[] = [];
    for (const kudoId of kudoIds) {
      const { data: k } = await admin.from("kudos")
        .select("id, to_person_id, from_person_id, from_slack_name, category, message")
        .eq("id", kudoId).maybeSingle();
      if (!k?.to_person_id) { results.push({ kudoId, status: "skipped_no_recipient" }); continue; }
      const { data: toP } = await admin.from("people")
        .select("id, nome, email, email_pessoal, slack_user_id")
        .eq("id", k.to_person_id).maybeSingle();
      if (!toP) { results.push({ kudoId, status: "no_person" }); continue; }

      const { id: slackId, tried, err } = await resolveSlackId(admin, toP);
      if (!slackId) {
        await admin.from("audit_logs").insert({
          entidade: "kudos", entidade_id: `${k.id}:${k.to_person_id}`, acao: "KUDOS_RECIPIENT_DM",
          payload: { kudo_id: k.id, recipient_id: k.to_person_id, status: "no_slack_id", emails_tried: tried, error: err },
        });
        results.push({ kudoId, status: "no_slack_id", tried, err });
        continue;
      }

      let fromName = k.from_slack_name || "Alguém";
      if (k.from_person_id) {
        const { data: fp } = await admin.from("people").select("nome").eq("id", k.from_person_id).maybeSingle();
        if (fp?.nome) fromName = fp.nome;
      }
      const catLabel = CATEGORY_LABEL[k.category] || "🍪";
      const text =
        `🍪 *Você ganhou um biscoito!*\n${catLabel}\nDe: *${fromName}*\n> ${k.message}\n\nVeja seu feed em /engagement`;

      const open = await (await fetch("https://slack.com/api/conversations.open", {
        method: "POST", headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ users: slackId }),
      })).json();
      if (!open.ok || !open.channel?.id) {
        results.push({ kudoId, status: "open_failed", err: open.error }); continue;
      }
      const post = await (await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST", headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel: open.channel.id, text }),
      })).json();
      if (!post.ok) {
        await admin.from("audit_logs").insert({
          entidade: "kudos", entidade_id: `${k.id}:${k.to_person_id}`, acao: "KUDOS_RECIPIENT_DM",
          payload: { kudo_id: k.id, recipient_id: k.to_person_id, status: "failed", stage: "chat.postMessage", error: post.error },
        });
        results.push({ kudoId, status: "post_failed", err: post.error }); continue;
      }
      await admin.from("audit_logs").insert({
        entidade: "kudos", entidade_id: `${k.id}:${k.to_person_id}`, acao: "KUDOS_RECIPIENT_DM",
        payload: { kudo_id: k.id, recipient_id: k.to_person_id, status: "sent", slack_user_id: slackId, channel: open.channel.id, ts: post.ts, emails_tried: tried, redeliver: true },
      });
      results.push({ kudoId, status: "sent", slackId, tried });
    }
    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
