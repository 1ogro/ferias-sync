// send-weekly-open-requests-digest — sends a weekly Slack DM to each manager
// with their team's open requests and a global digest to all active directors.
// RAG flag is based on days until request start date.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getPrefs,
  lookupSlackUserByEmail,
  sendSlackDM,
} from "../_shared/notify-helpers.ts";
import { todayInSP } from "../_shared/date.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPEN_STATUSES = [
  "PENDENTE",
  "AGUARDANDO_GESTOR",
  "AGUARDANDO_DIRETOR",
  "INFORMACOES_ADICIONAIS",
];

const TIPO_LABEL: Record<string, string> = {
  FERIAS: "Férias",
  DAY_OFF: "Day-off",
  LICENCA_MEDICA: "Licença médica",
  LICENCA_MATERNIDADE: "Licença maternidade",
  ABONO: "Abono",
  OUTROS: "Outros",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

function daysBetween(target: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = target.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  return Math.ceil((t.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function ragEmoji(daysUntil: number): { emoji: string; rank: number } {
  if (daysUntil <= 7) return { emoji: "🔴", rank: 0 };
  if (daysUntil <= 15) return { emoji: "🟡", rank: 1 };
  return { emoji: "🟢", rank: 2 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch all open requests with requester + manager info
    const { data: requests, error } = await admin
      .from("requests")
      .select(`
        id, tipo, inicio, fim, status, created_at,
        requester:people!requester_id(id, nome, gestor_id, ativo)
      `)
      .in("status", OPEN_STATUSES);

    if (error) throw error;

    type Req = {
      id: string;
      tipo: string;
      inicio: string | null;
      fim: string | null;
      created_at: string;
      requester: { id: string; nome: string; gestor_id: string | null; ativo: boolean };
      daysUntil: number;
      rag: { emoji: string; rank: number };
    };

    const enriched: Req[] = (requests || [])
      .filter((r: any) => r.requester?.ativo && r.inicio)
      .map((r: any) => {
        const daysUntil = daysBetween(r.inicio);
        return { ...r, daysUntil, rag: ragEmoji(daysUntil) };
      });

    // Lookup managers
    const managerIds = Array.from(
      new Set(enriched.map((r) => r.requester.gestor_id).filter(Boolean) as string[]),
    );
    const { data: managers } = await admin
      .from("people")
      .select("id, nome, email, ativo")
      .in("id", managerIds.length ? managerIds : ["__none__"]);
    const managerMap = new Map<string, any>(
      (managers || []).map((m: any) => [m.id, m]),
    );

    const formatLine = (r: Req, includeManager = false): string => {
      const tipo = TIPO_LABEL[r.tipo] || r.tipo;
      const period = r.fim && r.fim !== r.inicio
        ? `${fmtDate(r.inicio)} a ${fmtDate(r.fim)}`
        : fmtDate(r.inicio);
      const opened = fmtDate(r.created_at.slice(0, 10));
      const mgr = includeManager
        ? ` → gestor: ${managerMap.get(r.requester.gestor_id!)?.nome || "—"}`
        : "";
      return `${r.rag.emoji} ${r.requester.nome}${mgr} — ${tipo} ${period} (aberta em ${opened})`;
    };

    const sortReqs = (a: Req, b: Req) =>
      a.rag.rank - b.rag.rank || a.daysUntil - b.daysUntil;

    const inboxUrl = "https://ferias-sync.lovable.app/inbox";
    const results: any[] = [];

    // === Per-manager DMs ===
    const byManager = new Map<string, Req[]>();
    for (const r of enriched) {
      const mid = r.requester.gestor_id;
      if (!mid) continue;
      if (!byManager.has(mid)) byManager.set(mid, []);
      byManager.get(mid)!.push(r);
    }

    for (const [mid, reqs] of byManager) {
      const mgr = managerMap.get(mid);
      if (!mgr?.ativo || !mgr?.email) continue;

      const prefs = await getPrefs(admin, mid);
      if (!prefs.slack) {
        results.push({ manager_id: mid, skipped: "slack_disabled" });
        continue;
      }

      const slackId = await lookupSlackUserByEmail(mgr.email);
      if (!slackId) {
        results.push({ manager_id: mid, skipped: "no_slack_user" });
        continue;
      }

      reqs.sort(sortReqs);
      const text =
        `:bell: *Solicitações em aberto da sua equipe* (${reqs.length})\n\n` +
        reqs.map((r) => formatLine(r)).join("\n") +
        `\n\nAcesse: ${inboxUrl}`;

      await sendSlackDM(slackId, text);

      await admin.from("audit_logs").insert({
        entidade: "requests",
        entidade_id: `weekly:${todayInSP().iso}:${mid}`,
        acao: "WEEKLY_OPEN_REQUESTS_DIGEST",
        actor_id: mid,
        payload: { manager_id: mid, count: reqs.length, audience: "manager" },
      });
      results.push({ manager_id: mid, sent: reqs.length });
    }

    // === Director digest ===
    const { data: directors } = await admin
      .from("people")
      .select("id, nome, email")
      .eq("ativo", true)
      .eq("papel", "DIRETOR");

    const sortedAll = [...enriched].sort(sortReqs);
    const directorText = sortedAll.length === 0
      ? `:bell: *Solicitações em aberto (visão geral)*\n\nNenhuma solicitação em aberto. 🎉`
      : `:bell: *Solicitações em aberto (visão geral)* (${sortedAll.length})\n\n` +
        sortedAll.map((r) => formatLine(r, true)).join("\n") +
        `\n\nAcesse: ${inboxUrl}`;

    for (const d of directors || []) {
      if (!d.email) continue;
      const prefs = await getPrefs(admin, d.id);
      if (!prefs.slack) {
        results.push({ director_id: d.id, skipped: "slack_disabled" });
        continue;
      }
      const slackId = await lookupSlackUserByEmail(d.email);
      if (!slackId) {
        results.push({ director_id: d.id, skipped: "no_slack_user" });
        continue;
      }
      await sendSlackDM(slackId, directorText);
      await admin.from("audit_logs").insert({
        entidade: "requests",
        entidade_id: `weekly:${todayInSP().iso}:dir:${d.id}`,
        acao: "WEEKLY_OPEN_REQUESTS_DIGEST",
        actor_id: d.id,
        payload: { director_id: d.id, count: sortedAll.length, audience: "director" },
      });
      results.push({ director_id: d.id, sent: sortedAll.length });
    }

    return new Response(
      JSON.stringify({ ok: true, managers: byManager.size, directors: (directors || []).length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("send-weekly-open-requests-digest error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
