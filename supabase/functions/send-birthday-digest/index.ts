import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");

const MES_PT = [
  "janeiro","fevereiro","março","abril","maio","junho",
  "julho","agosto","setembro","outubro","novembro","dezembro",
];

function todayInSaoPaulo() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const year = get("year"), month = get("month"), day = get("day");
  return { iso: `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`, day, month, year };
}

async function findSlackUserId(name: string, email: string): Promise<string | null> {
  if (!SLACK_BOT_TOKEN) return null;
  try {
    const r = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const d = await r.json();
    if (d.ok && d.user?.id) return d.user.id;
  } catch (_) {}
  let cursor = "";
  do {
    const r = await fetch(`https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const d = await r.json();
    if (!d.ok) return null;
    const nl = name.toLowerCase();
    const match = d.members?.find((u: any) =>
      u.real_name?.toLowerCase() === nl || u.profile?.display_name?.toLowerCase() === nl
    );
    if (match) return match.id;
    cursor = d.response_metadata?.next_cursor || "";
  } while (cursor);
  return null;
}

async function sendSlackDM(userId: string, text: string) {
  if (!SLACK_BOT_TOKEN) return;
  const open = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ users: userId }),
  }).then(r => r.json());
  if (!open.ok) { console.error("conversations.open failed", open.error); return; }
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel: open.channel.id, text, username: "Aniversários", icon_emoji: ":birthday:" }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    const dryRun = body?.dry_run === true;
    const overrideDate: string | undefined = body?.date;

    const { iso: todayIso, day: todayDay, month, year } = overrideDate
      ? (() => { const [y,m,d] = overrideDate.split("-").map(Number); return { iso: overrideDate, day:d, month:m, year:y }; })()
      : todayInSaoPaulo();

    const { data: existingLog } = await supabase
      .from("audit_logs").select("id")
      .eq("entidade", "birthday").eq("acao", "MONTHLY_DIGEST")
      .eq("entidade_id", todayIso).maybeSingle();
    if (existingLog && !dryRun) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "already_sent_today" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: people } = await supabase
      .from("people")
      .select("id, nome, email, cargo, data_nascimento, gestor_id")
      .eq("ativo", true)
      .not("data_nascimento", "is", null);

    const birthdays = (people || [])
      .filter((p: any) => Number(p.data_nascimento.split("-")[1]) === month)
      .map((p: any) => {
        const d = Number(p.data_nascimento.split("-")[2]);
        return { ...p, aniv_day: d, passed: d < todayDay };
      })
      .sort((a: any, b: any) => a.aniv_day - b.aniv_day);

    const mesAno = `${MES_PT[month - 1]}/${year}`;
    const buildText = (list: any[], titlePrefix: string) => {
      if (list.length === 0) return `🎂 *${titlePrefix} em ${mesAno}:* nenhum este mês.`;
      const lines = list.map((a: any) => {
        const dayStr = String(a.aniv_day).padStart(2, "0");
        const icon = a.passed ? "✅" : "⏳";
        return `${icon} *${dayStr}/${String(month).padStart(2,"0")}* — ${a.nome}${a.cargo ? ` (${a.cargo})` : ""}`;
      });
      return `🎂 *${titlePrefix} em ${mesAno}* (${list.length}):\n${lines.join("\n")}\n\n✅ já passou neste mês · ⏳ ainda este mês`;
    };

    const results: any[] = [];

    // Directors: full list
    const { data: directors } = await supabase
      .from("people").select("id, nome, email")
      .eq("ativo", true).eq("papel", "DIRETOR");

    const directorIds = (directors || []).map((d: any) => d.id);
    const { data: dirPrefs } = await supabase
      .from("notification_preferences")
      .select("person_id, system_alerts_slack")
      .in("person_id", directorIds);
    const dirPrefMap = new Map((dirPrefs || []).map((p: any) => [p.person_id, p]));

    const directorText = buildText(birthdays, "Aniversários da equipe");
    for (const dir of directors || []) {
      const pref = dirPrefMap.get(dir.id);
      if (pref && pref.system_alerts_slack === false) continue;
      if (!SLACK_BOT_TOKEN || dryRun) continue;
      try {
        const uid = await findSlackUserId(dir.nome, dir.email);
        if (uid) { await sendSlackDM(uid, directorText); results.push({ director: dir.nome, slack: "sent" }); }
        else results.push({ director: dir.nome, slack: "user_not_found" });
      } catch (e: any) { results.push({ director: dir.nome, slack: "failed", error: e?.message }); }
    }

    // Managers: filtered per team
    const managerResults: any[] = [];
    if (birthdays.length > 0) {
      const byManager = new Map<string, any[]>();
      for (const b of birthdays) {
        if (!b.gestor_id) continue;
        if (!byManager.has(b.gestor_id)) byManager.set(b.gestor_id, []);
        byManager.get(b.gestor_id)!.push(b);
      }
      const directorIdSet = new Set(directorIds);
      const mgrIds = Array.from(byManager.keys()).filter((id) => !directorIdSet.has(id));
      if (mgrIds.length > 0) {
        const { data: managers } = await supabase
          .from("people").select("id, nome, email")
          .in("id", mgrIds).eq("ativo", true);
        const { data: mgrPrefs } = await supabase
          .from("notification_preferences").select("person_id, system_alerts_slack")
          .in("person_id", mgrIds);
        const mgrPrefMap = new Map((mgrPrefs || []).map((p: any) => [p.person_id, p]));

        for (const mgr of managers || []) {
          const pref = mgrPrefMap.get(mgr.id);
          if (pref && pref.system_alerts_slack === false) continue;
          if (!SLACK_BOT_TOKEN || dryRun) continue;
          const list = byManager.get(mgr.id) || [];
          const text = buildText(list, "Aniversários do seu time");
          try {
            const uid = await findSlackUserId(mgr.nome, mgr.email);
            if (uid) { await sendSlackDM(uid, text); managerResults.push({ manager: mgr.nome, slack: "sent", count: list.length }); }
            else managerResults.push({ manager: mgr.nome, slack: "user_not_found" });
          } catch (e: any) { managerResults.push({ manager: mgr.nome, slack: "failed", error: e?.message }); }
        }
      }
    }

    if (!dryRun) {
      await supabase.from("audit_logs").insert({
        entidade: "birthday", entidade_id: todayIso, acao: "MONTHLY_DIGEST", actor_id: null,
        payload: { trigger_date: todayIso, month: `${year}-${String(month).padStart(2,"0")}`,
          count: birthdays.length, results, manager_results: managerResults },
      });
    }

    return new Response(JSON.stringify({
      success: true, trigger_date: todayIso, count: birthdays.length,
      directors_count: (directors || []).length, dry_run: dryRun, results, manager_results: managerResults,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: error?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
