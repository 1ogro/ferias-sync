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

const MES_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function todayInSaoPaulo(): { iso: string; day: number; month: number; year: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
  const year = get("year"), month = get("month"), day = get("day");
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { iso, day, month, year };
}

async function findSlackUserId(name: string, email: string): Promise<string | null> {
  if (!SLACK_BOT_TOKEN) return null;
  try {
    const r = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const d = await r.json();
    if (d.ok && d.user?.id) return d.user.id;
  } catch (_) { /* ignore */ }
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

async function sendSlackDM(userId: string, text: string) {
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
    body: JSON.stringify({ channel, text, username: "Aniversários de Contrato", icon_emoji: ":tada:" }),
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

    const { iso: todayIso, day: todayDay, month, year } = overrideDate
      ? (() => {
          const [y, m, d] = overrideDate.split("-").map(Number);
          return { iso: overrideDate, day: d, month: m, year: y };
        })()
      : todayInSaoPaulo();

    console.log(`Monthly contract anniversary digest for ${MES_PT[month - 1]}/${year} (trigger ${todayIso})`);

    // Idempotency per day
    const { data: existingLog } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("entidade", "contract_anniversary")
      .eq("acao", "MONTHLY_DIGEST")
      .eq("entidade_id", todayIso)
      .maybeSingle();

    if (existingLog && !dryRun) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "already_sent_today" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PJ collaborators with anniversary in current month
    const { data: pjPeople, error: pjErr } = await supabase
      .from("people")
      .select("id, nome, email, cargo, data_contrato")
      .eq("ativo", true)
      .eq("modelo_contrato", "PJ")
      .not("data_contrato", "is", null);
    if (pjErr) throw pjErr;

    const anniversaries = (pjPeople || [])
      .filter((p: any) => {
        if (!p.data_contrato) return false;
        const [, m] = p.data_contrato.split("-").map(Number);
        return m === month;
      })
      .map((p: any) => {
        const [y, , d] = p.data_contrato.split("-").map(Number);
        return {
          ...p,
          aniv_day: d,
          years_completed: year - y,
          passed: d < todayDay,
        };
      })
      .sort((a: any, b: any) => a.aniv_day - b.aniv_day);

    // Directors
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

    const mesAno = `${MES_PT[month - 1]}/${year}`;
    const slackHeader = anniversaries.length === 0
      ? `📅 *Aniversários de contrato PJ em ${mesAno}:* nenhum este mês.`
      : `📅 *Aniversários de contrato PJ em ${mesAno}* (${anniversaries.length}):`;

    const slackLines = anniversaries.map((a: any) => {
      const dayStr = String(a.aniv_day).padStart(2, "0");
      const icon = a.passed ? "✅" : "⏳";
      return `${icon} *${dayStr}/${String(month).padStart(2, "0")}* — ${a.nome}${a.cargo ? ` (${a.cargo})` : ""} — ${a.years_completed} ${a.years_completed === 1 ? "ano" : "anos"} de contrato`;
    });
    const slackText = anniversaries.length === 0
      ? slackHeader
      : `${slackHeader}\n${slackLines.join("\n")}\n\n✅ já passou neste mês · ⏳ ainda este mês`;

    const emailHtml = anniversaries.length === 0
      ? `<h2>📅 Aniversários de contrato PJ — ${mesAno}</h2><p>Nenhum contrato PJ faz aniversário neste mês.</p>`
      : `
        <h2>📅 Aniversários de contrato PJ — ${mesAno}</h2>
        <p>${anniversaries.length} ${anniversaries.length === 1 ? "colaborador" : "colaboradores"} PJ completando mais um ano de contrato neste mês:</p>
        <table style="border-collapse:collapse;width:100%;max-width:640px">
          <thead>
            <tr style="background:#f3f4f6;text-align:left">
              <th style="padding:8px;border:1px solid #e5e7eb">Dia</th>
              <th style="padding:8px;border:1px solid #e5e7eb">Colaborador</th>
              <th style="padding:8px;border:1px solid #e5e7eb">Cargo</th>
              <th style="padding:8px;border:1px solid #e5e7eb">Anos</th>
              <th style="padding:8px;border:1px solid #e5e7eb">Status</th>
            </tr>
          </thead>
          <tbody>
            ${anniversaries.map((a: any) => `
              <tr>
                <td style="padding:8px;border:1px solid #e5e7eb">${String(a.aniv_day).padStart(2, "0")}/${String(month).padStart(2, "0")}</td>
                <td style="padding:8px;border:1px solid #e5e7eb"><strong>${a.nome}</strong></td>
                <td style="padding:8px;border:1px solid #e5e7eb">${a.cargo ?? "—"}</td>
                <td style="padding:8px;border:1px solid #e5e7eb">${a.years_completed}</td>
                <td style="padding:8px;border:1px solid #e5e7eb">${a.passed ? "✅ já passou" : "⏳ ainda este mês"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <p style="color:#6b7280;font-size:12px;margin-top:12px">Resumo enviado nos dias 01, 10, 20 e 30 de cada mês.</p>
      `;

    const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
    const results: any[] = [];

    for (const dir of directors || []) {
      const pref = prefMap.get(dir.id);
      const sendEmail = !pref || pref.system_alerts_email !== false;
      const sendSlack = !pref || pref.system_alerts_slack !== false;

      if (sendEmail && resend && dir.email && !dryRun) {
        try {
          await resend.emails.send({
            from: "Aniversários de Contrato <onboarding@resend.dev>",
            to: [dir.email],
            subject: `📅 Aniversários de contrato PJ — ${mesAno} (${anniversaries.length})`,
            html: emailHtml,
          });
          results.push({ director: dir.nome, email: "sent" });
        } catch (e: any) {
          console.error("email error", dir.email, e?.message);
          results.push({ director: dir.nome, email: "failed", error: e?.message });
        }
      }

      if (sendSlack && SLACK_BOT_TOKEN && !dryRun) {
        try {
          const slackUserId = await findSlackUserId(dir.nome, dir.email);
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

    // ===== Per-manager digests (only members of own team) =====
    const managerResults: any[] = [];
    if (anniversaries.length > 0) {
      const personIds = anniversaries.map((a: any) => a.id);
      const { data: peopleWithMgr } = await supabase
        .from("people")
        .select("id, gestor_id")
        .in("id", personIds);
      const mgrMap = new Map((peopleWithMgr || []).map((p: any) => [p.id, p.gestor_id]));

      const byManager = new Map<string, any[]>();
      for (const a of anniversaries) {
        const mgrId = mgrMap.get(a.id);
        if (!mgrId) continue;
        if (!byManager.has(mgrId)) byManager.set(mgrId, []);
        byManager.get(mgrId)!.push(a);
      }

      const directorIdSet = new Set((directors || []).map((d: any) => d.id));
      const managerIdsToNotify = Array.from(byManager.keys()).filter((id) => !directorIdSet.has(id));

      if (managerIdsToNotify.length > 0) {
        const { data: managers } = await supabase
          .from("people")
          .select("id, nome, email")
          .in("id", managerIdsToNotify)
          .eq("ativo", true);

        const { data: mgrPrefs } = await supabase
          .from("notification_preferences")
          .select("person_id, system_alerts_slack")
          .in("person_id", managerIdsToNotify);
        const mgrPrefMap = new Map((mgrPrefs || []).map((p: any) => [p.person_id, p]));

        for (const mgr of managers || []) {
          const pref = mgrPrefMap.get(mgr.id);
          const sendSlack = !pref || pref.system_alerts_slack !== false;
          if (!sendSlack || !SLACK_BOT_TOKEN || dryRun) continue;

          const teamAnnivs = byManager.get(mgr.id) || [];
          const lines = teamAnnivs.map((a: any) => {
            const dayStr = String(a.aniv_day).padStart(2, "0");
            const icon = a.passed ? "✅" : "⏳";
            return `${icon} *${dayStr}/${String(month).padStart(2, "0")}* — ${a.nome}${a.cargo ? ` (${a.cargo})` : ""} — ${a.years_completed} ${a.years_completed === 1 ? "ano" : "anos"} de contrato`;
          });
          const mgrText = `📅 *Aniversários de contrato PJ do seu time em ${mesAno}* (${teamAnnivs.length}):\n${lines.join("\n")}\n\n✅ já passou neste mês · ⏳ ainda este mês`;

          try {
            const slackUserId = await findSlackUserId(mgr.nome, mgr.email);
            if (slackUserId) {
              await sendSlackDM(slackUserId, mgrText);
              managerResults.push({ manager: mgr.nome, slack: "sent", count: teamAnnivs.length });
            } else {
              managerResults.push({ manager: mgr.nome, slack: "user_not_found" });
            }
          } catch (e: any) {
            managerResults.push({ manager: mgr.nome, slack: "failed", error: e?.message });
          }
        }
      }
    }

    if (!dryRun) {
      await supabase.from("audit_logs").insert({
        entidade: "contract_anniversary",
        entidade_id: todayIso,
        acao: "MONTHLY_DIGEST",
        actor_id: null,
        payload: {
          trigger_date: todayIso,
          month: `${year}-${String(month).padStart(2, "0")}`,
          count: anniversaries.length,
          anniversaries: anniversaries.map((a: any) => ({ id: a.id, nome: a.nome, day: a.aniv_day, years: a.years_completed })),
          directors_notified: (directors || []).length,
          results,
          manager_results: managerResults,
        },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      trigger_date: todayIso,
      month: `${year}-${String(month).padStart(2, "0")}`,
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
