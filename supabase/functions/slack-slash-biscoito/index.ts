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

async function resolveSenderEmail(slackUserId: string): Promise<string | null> {
  const r = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  });
  const d = await r.json();
  return d?.user?.profile?.email ?? null;
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

async function openModal(opts: {
  slackUserId: string;
  triggerId: string;
  channelId: string;
  channelName: string;
  responseUrl: string;
}) {
  const { slackUserId, triggerId, channelId, channelName, responseUrl } = opts;
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const email = await resolveSenderEmail(slackUserId);
    if (!email) {
      await postEphemeral(responseUrl, "⚠️ Não consegui ler seu email no Slack. Verifique permissões do app.");
      return;
    }

    const { data: sender } = await supabase
      .from("people").select("id").eq("email", email).eq("ativo", true).maybeSingle();
    if (!sender) {
      await postEphemeral(responseUrl, "⚠️ Seu email do Slack não está cadastrado no sistema. Fale com um admin.");
      return;
    }

    const { data: people } = await supabase
      .from("people").select("id, nome").eq("ativo", true).neq("id", sender.id).order("nome").limit(100);

    const peopleOptions = (people || []).map((p: any) => ({
      text: { type: "plain_text", text: p.nome.slice(0, 75) },
      value: p.id,
    }));

    if (peopleOptions.length === 0) {
      await postEphemeral(responseUrl, "⚠️ Nenhum colega disponível para receber biscoitos.");
      return;
    }

    const categories = [
      { value: "teamwork", text: "🤝 Trabalho em equipe" },
      { value: "innovation", text: "💡 Inovação" },
      { value: "delivery", text: "🚀 Entrega" },
      { value: "leadership", text: "🏆 Liderança" },
      { value: "customer", text: "❤️ Foco no cliente" },
    ];

    const SHARE_CHANNEL = "#time";
    const privateMetadata = JSON.stringify({ channel_id: SHARE_CHANNEL });


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
            placeholder: { type: "plain_text", text: "Escolha um colega" },
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

    // Dispara abertura do modal em background — o trigger_id expira em 3s,
    // então precisamos responder o Slack agora.
    // @ts-ignore EdgeRuntime é disponibilizado pelo runtime do Supabase.
    EdgeRuntime.waitUntil(openModal({ slackUserId, triggerId, channelId, channelName, responseUrl }));

    return new Response(
      JSON.stringify({ response_type: "ephemeral", text: "🍪 Abrindo o formulário…" }),
      { headers: { "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err: any) {
    console.error("slack-slash-biscoito error:", err);
    return new Response(
      JSON.stringify({ response_type: "ephemeral", text: "⚠️ Erro inesperado ao processar o comando." }),
      { headers: { "Content-Type": "application/json" }, status: 200 },
    );
  }
});
