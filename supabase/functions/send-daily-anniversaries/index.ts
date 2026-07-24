import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");

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

function parseIsoDateParts(value?: string | null) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
}

function parseOverrideDate(value?: string) {
  const parts = parseIsoDateParts(value);
  if (!parts) return null;
  return {
    iso: value!,
    day: parts.day,
    month: parts.month,
    year: parts.year,
  };
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

async function sendSlackDM(userId: string, text: string, iconEmoji = ":tada:") {
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
    body: JSON.stringify({ channel: open.channel.id, text, username: "Aniversários", icon_emoji: iconEmoji }),
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

    const resolvedDate = overrideDate ? parseOverrideDate(overrideDate) : todayInSaoPaulo();
    if (!resolvedDate) {
      return new Response(JSON.stringify({ success: false, error: "date must be YYYY-MM-DD" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { iso: todayIso, day: todayDay, month: todayMonth, year } = resolvedDate;

    // Idempotency
    const { data: existingLog } = await supabase
      .from("audit_logs").select("id")
      .eq("entidade", "daily_anniversaries").eq("acao", "DAILY_NOTIFY")
      .eq("entidade_id", todayIso).maybeSingle();
    if (existingLog && !dryRun) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "already_sent_today" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch all active people with at least one relevant date
    const { data: people } = await supabase
      .from("people")
      .select("id, nome, email, cargo, gestor_id, data_nascimento, data_contrato")
      .eq("ativo", true);

    const birthdayToday = (people || []).filter((p: any) => {
      const parts = parseIsoDateParts(p.data_nascimento);
      return parts?.month === todayMonth && parts.day === todayDay;
    });

    const contractToday = (people || []).filter((p: any) => {
      const parts = parseIsoDateParts(p.data_contrato);
      if (!parts) return false;
      const { year: y, month: m, day: d } = parts;
      if (m !== todayMonth || d !== todayDay) return false;
      // Skip the day they were hired (year=0)
      return year > y;
    }).map((p: any) => {
      const y = parseIsoDateParts(p.data_contrato)?.year || year;
      return { ...p, years_completed: year - y };
    });

    // Directors
    const { data: directors } = await supabase
      .from("people").select("id, nome, email")
      .eq("ativo", true).eq("papel", "DIRETOR");
    const directorIds = (directors || []).map((d: any) => d.id);

    // Notification prefs (lookup for everyone we might message)
    const allPersonIds = new Set<string>([
      ...directorIds,
      ...birthdayToday.map((p: any) => p.id),
      ...birthdayToday.map((p: any) => p.gestor_id).filter(Boolean),
      ...contractToday.map((p: any) => p.gestor_id).filter(Boolean),
    ]);
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("person_id, system_alerts_slack")
      .in("person_id", Array.from(allPersonIds));
    const prefMap = new Map((prefs || []).map((p: any) => [p.person_id, p]));
    const slackAllowed = (personId: string) => {
      const p = prefMap.get(personId);
      return !p || p.system_alerts_slack !== false;
    };

    // Manager lookup
    const mgrIds = Array.from(new Set([
      ...birthdayToday.map((p: any) => p.gestor_id).filter(Boolean),
      ...contractToday.map((p: any) => p.gestor_id).filter(Boolean),
    ]));
    const { data: managers } = mgrIds.length > 0
      ? await supabase.from("people").select("id, nome, email").in("id", mgrIds).eq("ativo", true)
      : { data: [] as any[] };
    const mgrMap = new Map((managers || []).map((m: any) => [m.id, m]));

    const results: any[] = [];

    const notify = async (personId: string, name: string, email: string, text: string, icon = ":tada:") => {
      if (!slackAllowed(personId)) { results.push({ to: name, skipped: "pref_off" }); return; }
      if (!SLACK_BOT_TOKEN || dryRun) { results.push({ to: name, skipped: dryRun ? "dry_run" : "no_token" }); return; }
      try {
        const uid = await findSlackUserId(name, email);
        if (uid) { await sendSlackDM(uid, text, icon); results.push({ to: name, slack: "sent" }); }
        else results.push({ to: name, slack: "user_not_found" });
      } catch (e: any) { results.push({ to: name, slack: "failed", error: e?.message }); }
    };

    // --- Birthdays today ---
    for (const p of birthdayToday) {
      const firstName = p.nome.split(" ")[0];
      // To the person
      await notify(p.id, p.nome, p.email,
        `🎉 Feliz aniversário, ${firstName}! Que seu dia seja incrível. 🎂\n\nLembre-se: você tem direito ao *day-off de aniversário* no seu mês.`,
        ":birthday:");

      // To manager
      const mgr = p.gestor_id ? mgrMap.get(p.gestor_id) : null;
      if (mgr && !directorIds.includes(mgr.id)) {
        await notify(mgr.id, mgr.nome, mgr.email,
          `🎂 Hoje é aniversário de *${p.nome}*${p.cargo ? ` (${p.cargo})` : ""} do seu time. Não esqueça de parabenizar! 🎉`,
          ":birthday:");
      }

      // To directors
      for (const dir of directors || []) {
        await notify(dir.id, dir.nome, dir.email,
          `🎂 Hoje é aniversário de *${p.nome}*${p.cargo ? ` (${p.cargo})` : ""}. 🎉`,
          ":birthday:");
      }
    }

    // --- Contract anniversaries today ---
    for (const p of contractToday) {
      const years = p.years_completed;
      const yearsLabel = `${years} ${years === 1 ? "ano" : "anos"}`;

      const mgr = p.gestor_id ? mgrMap.get(p.gestor_id) : null;
      if (mgr && !directorIds.includes(mgr.id)) {
        await notify(mgr.id, mgr.nome, mgr.email,
          `📅 Hoje *${p.nome}*${p.cargo ? ` (${p.cargo})` : ""} completa *${yearsLabel}* de contrato! 🎊`,
          ":calendar:");
      }

      for (const dir of directors || []) {
        await notify(dir.id, dir.nome, dir.email,
          `📅 Hoje *${p.nome}*${p.cargo ? ` (${p.cargo})` : ""} completa *${yearsLabel}* de contrato. 🎊`,
          ":calendar:");
      }
    }

    if (!dryRun) {
      await supabase.from("audit_logs").insert({
        entidade: "daily_anniversaries",
        entidade_id: todayIso,
        acao: "DAILY_NOTIFY",
        actor_id: null,
        payload: {
          trigger_date: todayIso,
          birthdays: birthdayToday.map((p: any) => ({ id: p.id, nome: p.nome, data_nascimento: p.data_nascimento })),
          contracts: contractToday.map((p: any) => ({ id: p.id, nome: p.nome, years: p.years_completed })),
          results,
        },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      trigger_date: todayIso,
      birthdays_count: birthdayToday.length,
      contracts_count: contractToday.length,
      dry_run: dryRun,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: error?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
