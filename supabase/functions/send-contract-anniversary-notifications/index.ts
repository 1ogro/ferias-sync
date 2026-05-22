import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN");

function todayInSaoPaulo(): { iso: string; day: number; month: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const year = get("year"), month = get("month"), day = get("day");
  const iso = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  return { iso, day, month };
}

async function findSlackUserId(supabase: any, name: string, email: string): Promise<string | null> {
  if (!SLACK_BOT_TOKEN) return null;
  // try email first
  try {
    const r = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const d = await r.json();
    if (d.ok && d.user?.id) return d.user.id;
  } catch (_) { /* ignore */ }
  // fallback by name
  let cursor = "";
  do {
    const r = await fetch(`https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const d = await r.json();
    if (!d.ok) return null;
    const nl = name.toLowerCase();
    const match = d.members?.find((u: any) =>
      u.real_name?.toLowerCase() === nl ||
      u.profile?.display_name?.toLowerCase() === nl
    );
    if (match) return match.id;
    cursor = d.response_metadata?.next_cursor || "";
  } while (cursor);
  return null;
}

async function sendSlackDM(userId: string, text: string, blocks?: any[]) {
  if (!SLACK_BOT_TOKEN) return;
  const open = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ users: userId }),
  }).then(r => r.json());
  if (!open.ok) { console.error("conversations.open failed", open.error); return; }
  const channel = open.channel.id;
  const post = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, text, blocks, username: "Aniversários de Contrato", icon_emoji: ":tada:" }),
  }).then(r => r.json());
  if (!post.ok) console.error("chat.postMessage failed", post.error);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    const dryRun = body?.dry_run === true;
    const overrideDate: string | undefined = body?.date;

    const { iso: todayIso, day, month } = overrideDate
      ? (() => {
          const [y, m, d] = overrideDate.split("-").map(Number);
          return { iso: overrideDate, day: d, month: m };
        })()
      : todayInSaoPaulo();

    console.log(`Checking PJ contract anniversaries for ${todayIso} (day=${day}, month=${month})`);

    // Idempotency: skip if already logged today
    const { data: existingLog } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("entidade", "contract_anniversary")
      .eq("acao", "DAILY_RUN")
      .eq("entidade_id", todayIso)
      .maybeSingle();

    if (existingLog && !dryRun) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "already_sent_today" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find PJ collaborators with anniversary today
    const { data: pjPeople, error: pjErr } = await supabase
      .from("people")
      .select("id, nome, email, cargo, data_contrato, modelo_contrato")
      .eq("ativo", true)
      .eq("modelo_contrato", "PJ")
      .not("data_contrato", "is", null);

    if (pjErr) throw pjErr;

    const anniversaries = (pjPeople || []).filter((p: any) => {
      if (!p.data_contrato) return false;
      const [y, m, d] = p.data_contrato.split("-").map(Number);
      return m === month && d === day;
    }).map((p: any) => {
      const [y] = p.data_contrato.split("-").map(Number);
      const years = Number(String(todayIso).slice(0, 4)) - y;
      return { ...p, years_completed: years };
    });

    if (anniversaries.length === 0) {
      await supabase.from("audit_logs").insert({
        entidade: "contract_anniversary",
        entidade_id: todayIso,
        acao: "DAILY_RUN",
        actor_id: null,
        payload: { count: 0, date: todayIso },
      });
      return new Response(JSON.stringify({ success: true, count: 0, date: todayIso }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find directors + preferences
    const { data: directors, error: dirErr } = await supabase
      .from("people")
      .select("id, nome, email")
      .eq("ativo", true)
      .eq("papel", "DIRETOR");
    if (dirErr) throw dirErr;

    const directorIds = (directors || []).map((d: any) => d.id);
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("person_id, system_alerts_email, system_alerts_slack")
      .in("person_id", directorIds);
    const prefMap = new Map((prefs || []).map((p: any) => [p.person_id, p]));

    const lines = anniversaries.map((a: any) =>
      `• *${a.nome}*${a.cargo ? ` — ${a.cargo}` : ""} — ${a.years_completed} ${a.years_completed === 1 ? "ano" : "anos"} de contrato (desde ${a.data_contrato})`
    );
    const slackText = `🎉 *Aniversário(s) de contrato PJ hoje (${todayIso}):*\n${lines.join("\n")}`;
    const emailHtml = `
      <h2>🎉 Aniversários de contrato PJ — ${todayIso}</h2>
      <p>Colaboradores PJ completando mais um ano de contrato hoje:</p>
      <ul>
        ${anniversaries.map((a: any) =>
          `<li><strong>${a.nome}</strong>${a.cargo ? ` — ${a.cargo}` : ""} — ${a.years_completed} ${a.years_completed === 1 ? "ano" : "anos"} (desde ${a.data_contrato})</li>`
        ).join("")}
      </ul>
      <p>Considere reconhecer o tempo de parceria com cada um.</p>
    `;

    const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
    const results: any[] = [];

    for (const dir of directors || []) {
      const pref = prefMap.get(dir.id);
      const sendEmail = !pref || pref.system_alerts_email !== false;
      const sendSlack = !pref || pref.system_alerts_slack !== false;

      // Email
      if (sendEmail && resend && dir.email && !dryRun) {
        try {
          await resend.emails.send({
            from: "Aniversários de Contrato <onboarding@resend.dev>",
            to: [dir.email],
            subject: `🎉 ${anniversaries.length} aniversário(s) de contrato PJ hoje`,
            html: emailHtml,
          });
          results.push({ director: dir.nome, email: "sent" });
        } catch (e: any) {
          console.error("email error", dir.email, e?.message);
          results.push({ director: dir.nome, email: "failed", error: e?.message });
        }
      }

      // Slack
      if (sendSlack && SLACK_BOT_TOKEN && !dryRun) {
        try {
          const slackUserId = await findSlackUserId(supabase, dir.nome, dir.email);
          if (slackUserId) {
            await sendSlackDM(slackUserId, slackText);
            results.push({ director: dir.nome, slack: "sent" });
          } else {
            results.push({ director: dir.nome, slack: "user_not_found" });
          }
        } catch (e: any) {
          console.error("slack error", dir.nome, e?.message);
          results.push({ director: dir.nome, slack: "failed", error: e?.message });
        }
      }
    }

    if (!dryRun) {
      await supabase.from("audit_logs").insert({
        entidade: "contract_anniversary",
        entidade_id: todayIso,
        acao: "DAILY_RUN",
        actor_id: null,
        payload: {
          date: todayIso,
          anniversaries: anniversaries.map((a: any) => ({ id: a.id, nome: a.nome, years: a.years_completed })),
          directors_notified: (directors || []).length,
          results,
        },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      date: todayIso,
      anniversaries_count: anniversaries.length,
      directors_count: (directors || []).length,
      dry_run: dryRun,
      anniversaries,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: error?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
