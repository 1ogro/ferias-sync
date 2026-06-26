// Slash command /biscoito — abre modal de kudos no Slack.
// Padrão: ack em <3s, abre o modal em background via EdgeRuntime.waitUntil.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET")!;
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function verifySlackRequest(body: string, timestamp: string, signature: string): Promise<boolean> {
  const enc = new TextEncoder();
  const base = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(SLACK_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(base));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `v0=${hex}` === signature;
}

async function postEphemeral(responseUrl: string, text: string) {
  try {
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response_type: "ephemeral", text }),
    });
  } catch (e) {
    console.error("[response_url] post failed:", e);
  }
}

async function sendAppDM(slackUserId: string, text: string) {
  try {
    const openRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ users: slackUserId }),
    });
    const open = await openRes.json();
    if (!open.ok || !open.channel?.id) {
      console.log(`[slash-biscoito] app dm open failed: ${open.error || "unknown"}`);
      return;
    }
    const postRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: open.channel.id, text }),
    });
    const post = await postRes.json();
    if (!post.ok) console.log(`[slash-biscoito] app dm post failed: ${post.error || "unknown"}`);
  } catch (e: any) {
    console.error("[slash-biscoito] app dm error:", e?.message || e);
  }
}

type SlackMember = {
  id: string;
  name?: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  profile?: { email?: string; display_name?: string; real_name?: string };
};

async function listAllSlackMembers(): Promise<SlackMember[]> {
  const members: SlackMember[] = [];
  let cursor = "";
  for (let i = 0; i < 20; i++) { // safety cap
    const url = `https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } });
    const d = await r.json();
    if (!d.ok) {
      console.error("[users.list]", d.error);
      break;
    }
    for (const m of (d.members || []) as SlackMember[]) {
      if (m.deleted) continue;
      if (m.is_bot) continue;
      if (m.id === "USLACKBOT") continue;
      members.push(m);
    }
    cursor = d.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }
  return members;
}

function pickDisplayName(m: SlackMember): string {
  return (
    m.profile?.display_name?.trim() ||
    m.profile?.real_name?.trim() ||
    m.real_name?.trim() ||
    m.name ||
    m.id
  );
}

async function openModal(opts: {
  slackUserId: string;
  triggerId: string;
  channelId: string;
  channelName: string;
  responseUrl: string;
}) {
  const { slackUserId, triggerId, channelId, responseUrl } = opts;

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Lista todos os usuários do Slack (não-bots, ativos)
    const slackMembers = await listAllSlackMembers();
    if (slackMembers.length === 0) {
      await postEphemeral(responseUrl, "⚠️ Não consegui listar os usuários do Slack. Verifique as permissões do app (users:read, users:read.email).");
      return;
    }

    const normEmail = (v: unknown): string =>
      typeof v === "string" ? v.trim().toLowerCase() : "";

    // Carrega pessoas cadastradas no app (por email normalizado)
    const { data: peopleRows } = await supabase
      .from("people")
      .select("id, nome, email")
      .eq("ativo", true);

    const emailToPerson = new Map<string, { id: string; nome: string }>();
    for (const p of (peopleRows || []) as Array<{ id: string; nome: string; email: string | null }>) {
      const e = normEmail(p.email);
      if (e) emailToPerson.set(e, { id: p.id, nome: p.nome });
    }

    // Descobre o email do sender (pode ter múltiplas contas Slack)
    let senderEmail = "";
    try {
      const r = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(slackUserId)}`, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      });
      const d = await r.json();
      if (d.ok) senderEmail = normEmail(d.user?.profile?.email);
    } catch (e) {
      console.warn("[slash-biscoito] users.info sender failed:", e);
    }

    type Opt = { text: string; value: string; sortKey: string };
    const opts: Opt[] = [];
    const seenPersonIds = new Set<string>();
    const seenSlackIds = new Set<string>();
    let noEmailCount = 0;

    for (const m of slackMembers) {
      if (m.id === slackUserId) continue;
      const email = normEmail(m.profile?.email);
      if (senderEmail && email && email === senderEmail) continue; // outra conta do próprio sender

      const person = email ? emailToPerson.get(email) : undefined;
      if (person) {
        if (seenPersonIds.has(person.id)) continue;
        seenPersonIds.add(person.id);
        opts.push({ text: person.nome, value: `app:${person.id}`, sortKey: person.nome.toLowerCase() });
      } else {
        if (!email) noEmailCount++;
        if (seenSlackIds.has(m.id)) continue;
        seenSlackIds.add(m.id);
        const name = pickDisplayName(m);
        opts.push({ text: `${name} [slack only]`, value: `slack:${m.id}`, sortKey: name.toLowerCase() });
      }
    }
    if (noEmailCount > 0) {
      console.log(`[slash-biscoito] ${noEmailCount} Slack members without email (check users:read.email scope)`);
    }
    opts.sort((a, b) => a.sortKey.localeCompare(b.sortKey, "pt"));

    if (opts.length === 0) {
      await postEphemeral(responseUrl, "⚠️ Nenhum colega disponível para receber biscoitos.");
      return;
    }

    // Slack limita 100 options em static_select
    const limited = opts.slice(0, 100);
    const peopleOptions = limited.map(o => ({
      text: { type: "plain_text", text: o.text.slice(0, 75) },
      value: o.value,
    }));

    const categories = [
      { value: "teamwork", text: "🤝 Trabalho em equipe" },
      { value: "innovation", text: "💡 Inovação" },
      { value: "delivery", text: "🚀 Entrega" },
      { value: "leadership", text: "🏆 Liderança" },
      { value: "customer", text: "❤️ Foco no cliente" },
    ];

    const SHARE_CHANNEL = "#time";
    const privateMetadata = JSON.stringify({ channel_id: SHARE_CHANNEL, origin_channel_id: channelId || null });

    const view = {
      type: "modal",
      callback_id: "biscoito_submit",
      private_metadata: privateMetadata,
      title: { type: "plain_text", text: "🍪 Dar um biscoito" },
      submit: { type: "plain_text", text: "Enviar" },
      close: { type: "plain_text", text: "Cancelar" },
      blocks: [
        {
          type: "input",
          block_id: "kudo_to_block",
          label: { type: "plain_text", text: "Para quem?" },
          element: {
            type: "static_select",
            action_id: "kudo_to_select",
            placeholder: { type: "plain_text", text: "Escolha um colega do Slack" },
            options: peopleOptions,
          },
        },
        {
          type: "input",
          block_id: "kudo_cat_block",
          label: { type: "plain_text", text: "Categoria" },
          element: {
            type: "static_select",
            action_id: "kudo_cat_select",
            initial_option: {
              text: { type: "plain_text", text: categories[0].text },
              value: categories[0].value,
            },
            options: categories.map(c => ({
              text: { type: "plain_text", text: c.text },
              value: c.value,
            })),
          },
        },
        {
          type: "input",
          block_id: "kudo_msg_block",
          label: { type: "plain_text", text: "Mensagem" },
          element: {
            type: "plain_text_input",
            action_id: "kudo_msg_input",
            multiline: true,
            min_length: 3,
            max_length: 500,
            placeholder: { type: "plain_text", text: "Diga por que esse colega merece um biscoito 🍪" },
          },
        },
        {
          type: "input",
          block_id: "kudo_share_block",
          optional: true,
          label: { type: "plain_text", text: "Compartilhar" },
          element: {
            type: "checkboxes",
            action_id: "kudo_share_check",
            options: [{
              text: { type: "plain_text", text: `Postar em ${SHARE_CHANNEL}` },
              value: "share",
            }],
          },
        },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: "Colegas com [slack only] ainda não têm conta no app — o biscoito é registrado e os pontos entram no painel assim que o cadastro for aprovado." },
          ],
        },
      ],
    };

    const res = await fetch("https://slack.com/api/views.open", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trigger_id: triggerId, view }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("[views.open]", data);
      await postEphemeral(responseUrl, `⚠️ Não consegui abrir o formulário: ${data.error}`);
    }
  } catch (err: any) {
    console.error("openModal error:", err);
    await postEphemeral(responseUrl, "⚠️ Erro inesperado ao abrir o formulário.");
  }
}

serve(async (req) => {
  try {
    const raw = await req.text();
    const ts = req.headers.get("X-Slack-Request-Timestamp") || "";
    const sig = req.headers.get("X-Slack-Signature") || "";
    if (!(await verifySlackRequest(raw, ts, sig))) {
      return new Response("Unauthorized", { status: 401 });
    }

    const params = new URLSearchParams(raw);
    const slackUserId = params.get("user_id") || "";
    const triggerId = params.get("trigger_id") || "";
    const channelId = params.get("channel_id") || "";
    const channelName = params.get("channel_name") || "";
    const responseUrl = params.get("response_url") || "";

    // @ts-ignore EdgeRuntime é disponibilizado pelo runtime do Supabase.
    EdgeRuntime.waitUntil(openModal({ slackUserId, triggerId, channelId, channelName, responseUrl }));
    // @ts-ignore
    EdgeRuntime.waitUntil(sendAppDM(slackUserId, "🍪 Abrindo o formulário do biscoito…"));

    return new Response("", { status: 200 });

  } catch (err: any) {
    console.error("slack-slash-biscoito error:", err);
    return new Response("", { status: 200 });
  }
});
