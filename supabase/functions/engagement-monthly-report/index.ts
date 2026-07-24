// engagement-monthly-report — DM no Slack para gestores (resumo do time) e diretores (resumo global).
// Agendada via pg_cron dia 1 às 9h. Aceita ?dry_run=true para inspecionar payload sem enviar.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function lookupSlack(email: string): Promise<string | null> {
  const res = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
  );
  const d = await res.json();
  return d.ok ? d.user.id : null;
}

async function openIm(uid: string): Promise<string | null> {
  const r = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ users: uid }),
  });
  const d = await r.json();
  return d.ok ? d.channel.id : null;
}

async function sendDM(channel: string, blocks: any[], text: string) {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, text, blocks }),
  });
}

type PeriodKind = "month" | "quarter" | "year";

function resolvePeriod(forced?: string | null): { start: Date; end: Date; label: string; kind: PeriodKind; auditId: string; titleSuffix: string } {
  // "Hoje" em SP → mês recém-encerrado = mês anterior (função roda no dia 1 BRT)
  const spFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const spParts = spFmt.formatToParts(new Date());
  const spY = Number(spParts.find(p => p.type === "year")?.value);
  const spM = Number(spParts.find(p => p.type === "month")?.value); // 1..12
  const prevMonthDate = new Date(spY, spM - 2, 1); // mês -1
  const prevMonthIdx = prevMonthDate.getMonth();   // 0..11
  const prevMonthYear = prevMonthDate.getFullYear();

  let kind: PeriodKind;
  if (forced === "month" || forced === "quarter" || forced === "year") {
    kind = forced;
  } else if (prevMonthIdx === 11) {
    kind = "year";
  } else if (prevMonthIdx === 2 || prevMonthIdx === 5 || prevMonthIdx === 8) {
    kind = "quarter";
  } else {
    kind = "month";
  }

  if (kind === "year") {
    const start = new Date(prevMonthYear, 0, 1);
    const end = new Date(prevMonthYear + 1, 0, 1);
    return {
      start, end, kind,
      label: `${prevMonthYear}`,
      auditId: `${prevMonthYear}`,
      titleSuffix: "anual",
    };
  }
  if (kind === "quarter") {
    const q = Math.floor(prevMonthIdx / 3); // 0..3
    const start = new Date(prevMonthYear, q * 3, 1);
    const end = new Date(prevMonthYear, q * 3 + 3, 1);
    return {
      start, end, kind,
      label: `Q${q + 1}/${prevMonthYear}`,
      auditId: `${prevMonthYear}-Q${q + 1}`,
      titleSuffix: "trimestral",
    };
  }
  const start = new Date(prevMonthYear, prevMonthIdx, 1);
  const end = new Date(prevMonthYear, prevMonthIdx + 1, 1);
  return {
    start, end, kind,
    label: start.toLocaleString("pt-BR", { month: "long", year: "numeric" }),
    auditId: `${prevMonthYear}-${String(prevMonthIdx + 1).padStart(2, "0")}`,
    titleSuffix: "mensal",
  };
}

function buildReportBlocks(title: string, period: string, stats: any): any[] {
  const top = (stats.topKudos || []).slice(0, 5)
    .map((k: any, i: number) => `${i + 1}. *${k.nome}* — ${k.count} kudos`).join("\n") || "_Nenhum kudo neste período._";
  const ranking = (stats.ranking || []).slice(0, 5)
    .map((r: any, i: number) => `${i + 1}. *${r.nome}* — ${r.points} pts`).join("\n") || "_Sem pontuações registradas._";

  return [
    { type: "header", text: { type: "plain_text", text: `📊 ${title}` } },
    { type: "context", elements: [{ type: "mrkdwn", text: `Período: *${period}*` }] },
    { type: "divider" },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Pulses respondidos:*\n${stats.pulseResponses}` },
        { type: "mrkdwn", text: `*Taxa de resposta:*\n${stats.responseRate}%` },
        { type: "mrkdwn", text: `*Kudos trocados:*\n${stats.kudosCount}` },
        { type: "mrkdwn", text: `*Pessoas ativas:*\n${stats.activePeople}` },
      ],
    },
    { type: "section", text: { type: "mrkdwn", text: `*🏆 Top kudos recebidos*\n${top}` } },
    { type: "section", text: { type: "mrkdwn", text: `*⭐ Top pontuações*\n${ranking}` } },
  ];
}

async function computeStats(admin: any, peopleIds: string[], start: Date, end: Date) {
  if (peopleIds.length === 0) {
    return { pulseResponses: 0, responseRate: 0, kudosCount: 0, activePeople: 0, topKudos: [], ranking: [] };
  }
  const { count: responsesCount } = await admin
    .from("pulse_responses").select("*", { count: "exact", head: true })
    .gte("submitted_at", start.toISOString()).lt("submitted_at", end.toISOString())
    .in("respondent_id", peopleIds);

  const { data: runs } = await admin
    .from("pulse_runs").select("recipients_count, responses_count, dispatched_at")
    .gte("dispatched_at", start.toISOString()).lt("dispatched_at", end.toISOString());
  const totalSent = (runs || []).reduce((a: number, r: any) => a + (r.recipients_count || 0), 0);
  const totalAns = (runs || []).reduce((a: number, r: any) => a + (r.responses_count || 0), 0);
  const responseRate = totalSent > 0 ? Math.round((totalAns / totalSent) * 100) : 0;

  const { data: kudos } = await admin
    .from("kudos").select("to_person_id, people:to_person_id(nome)")
    .gte("created_at", start.toISOString()).lt("created_at", end.toISOString())
    .in("to_person_id", peopleIds);
  const kudosMap = new Map<string, { nome: string; count: number }>();
  (kudos || []).forEach((k: any) => {
    const cur = kudosMap.get(k.to_person_id) || { nome: k.people?.nome || k.to_person_id, count: 0 };
    cur.count++;
    kudosMap.set(k.to_person_id, cur);
  });
  const topKudos = [...kudosMap.values()].sort((a, b) => b.count - a.count);

  const { data: points } = await admin
    .from("engagement_points").select("person_id, points, people:person_id(nome)")
    .gte("created_at", start.toISOString()).lt("created_at", end.toISOString())
    .in("person_id", peopleIds);
  const pointsMap = new Map<string, { nome: string; points: number }>();
  (points || []).forEach((p: any) => {
    const cur = pointsMap.get(p.person_id) || { nome: p.people?.nome || p.person_id, points: 0 };
    cur.points += p.points;
    pointsMap.set(p.person_id, cur);
  });
  const ranking = [...pointsMap.values()].sort((a, b) => b.points - a.points);

  return {
    pulseResponses: responsesCount || 0,
    responseRate,
    kudosCount: (kudos || []).length,
    activePeople: peopleIds.length,
    topKudos, ranking,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") === "true";
    const forced = url.searchParams.get("period");
    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { start, end, label, kind, auditId, titleSuffix } = resolvePeriod(forced);

    // Managers: anyone who has at least one direct report active
    const { data: people } = await admin.from("people")
      .select("id, nome, email, papel, is_admin, gestor_id, sub_time")
      .eq("ativo", true);
    const all = people || [];
    const reportsByManager = new Map<string, string[]>();
    for (const p of all) {
      if (p.gestor_id) {
        const arr = reportsByManager.get(p.gestor_id) || [];
        arr.push(p.id);
        reportsByManager.set(p.gestor_id, arr);
      }
    }

    const results: any[] = [];

    // Managers
    for (const [managerId, reportIds] of reportsByManager) {
      const manager = all.find((p) => p.id === managerId);
      if (!manager?.email) continue;
      const stats = await computeStats(admin, reportIds, start, end);
      const blocks = buildReportBlocks(`Resumo ${titleSuffix} do seu time`, label, stats);
      results.push({ to: manager.email, scope: "manager", stats });
      if (!dryRun) {
        const uid = await lookupSlack(manager.email);
        if (uid) {
          const ch = await openIm(uid);
          if (ch) await sendDM(ch, blocks, `Resumo ${titleSuffix} do seu time (${label})`);
        }
      }
    }

    // Directors & admins → global
    const directors = all.filter((p) => p.papel === "DIRETOR" || p.is_admin);
    const allActiveIds = all.map((p) => p.id);
    const globalStats = await computeStats(admin, allActiveIds, start, end);
    const globalBlocks = buildReportBlocks(`Resumo ${titleSuffix} — visão global`, label, globalStats);
    for (const d of directors) {
      if (!d.email) continue;
      results.push({ to: d.email, scope: "director", stats: globalStats });
      if (!dryRun) {
        const uid = await lookupSlack(d.email);
        if (uid) {
          const ch = await openIm(uid);
          if (ch) await sendDM(ch, globalBlocks, `Resumo ${titleSuffix} global (${label})`);
        }
      }
    }

    const acao = kind === "year"
      ? "ANNUAL_ENGAGEMENT"
      : kind === "quarter"
        ? "QUARTERLY_ENGAGEMENT"
        : "MONTHLY_ENGAGEMENT";

    await admin.from("audit_logs").insert({
      entidade: "engagement",
      entidade_id: auditId,
      acao,
      actor_id: null,
      payload: { period: label, kind, dry_run: dryRun, sent: results.length, results },
    });

    return new Response(JSON.stringify({ ok: true, dry_run: dryRun, count: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("engagement-monthly-report error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
