// Gera links de relatório de liderança (sem login) e envia por DM no Slack
// para gestores (visão do time) e diretores (visão global) cadastrados.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { resolveSlackId, sendSlackDM } from "../_shared/notify-helpers.ts";

const APP_URL = (Deno.env.get("PUBLIC_APP_URL") || "https://ferias-sync.lovable.app").replace(/\/$/, "");
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.person_ids)
      ? body.person_ids.filter((x: unknown) => typeof x === "string").slice(0, 100)
      : [];
    const days = Number.isInteger(body?.days) ? body.days : 14;
    if (!ids.length) return json({ error: "Selecione ao menos uma pessoa" }, 400);

    const { data: people, error } = await admin
      .from("people")
      .select("id, nome, email, email_pessoal, slack_user_id, papel, is_admin")
      .in("id", ids)
      .neq("ativo", false);
    if (error) return json({ error: error.message }, 500);

    const results: any[] = [];
    for (const p of people ?? []) {
      const isDirector = p.papel === "DIRETOR" || p.is_admin;
      const scope = isDirector ? "global" : "team";
      const { data: link, error: le } = await userClient.rpc("create_leadership_report_link", {
        p_scope: scope,
        p_recipient_name: p.nome,
        p_manager_person_id: scope === "team" ? p.id : null,
        p_recipient_person_id: p.id,
        p_channel: "slack",
        p_days: days,
      });
      if (le) return json({ error: le.message }, 403);
      const row = Array.isArray(link) ? link[0] : link;
      const href = `${APP_URL}/relatorio-lideranca?token=${row.token}`;
      const slack = await resolveSlackId(admin, p);
      if (!slack.id) {
        results.push({ person_id: p.id, nome: p.nome, sent: false, reason: "Slack não encontrado", link: href });
        continue;
      }
      const label = scope === "global" ? "a visão da empresa" : "a visão do seu time";
      await sendSlackDM(
        slack.id,
        `📊 Olá, ${p.nome.split(" ")[0]}! Seu relatório de engajamento e bem-estar está pronto, com ${label}.\n` +
          `Abra sem precisar entrar no sistema: ${href}\n_O link vale por ${days} dias e é pessoal — não compartilhe._`,
      );
      results.push({ person_id: p.id, nome: p.nome, sent: true });
    }
    return json({ results });
  } catch (e: any) {
    console.error(e);
    return json({ error: String(e?.message || e) }, 500);
  }
});
