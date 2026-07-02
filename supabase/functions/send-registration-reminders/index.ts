// Sends Slack DM reminders to:
//   1) Managers/admins about pending_people awaiting approval
//   2) People with incomplete profile (missing critical registration/auth fields)
// Runs weekly and month-end via pg_cron.
//
// Body: { mode?: "weekly" | "month_end", dry_run?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  dedupWindowHours,
  groupPendingByManager,
  isNearMonthEnd,
  Mode,
  peopleIncompleteReasons,
  pendingMissingFields,
  selectPendings,
} from "./lib.ts";

const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;


interface PersonMini {
  id: string;
  nome: string;
  email: string | null;
  slack_user_id: string | null;
}

async function slackLookupByEmail(email: string): Promise<string | null> {
  if (!SLACK_BOT_TOKEN || !email) return null;
  try {
    const r = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } },
    );
    const d = await r.json();
    if (d.ok && d.user?.id) return d.user.id;
  } catch (_) { /* ignore */ }
  return null;
}

async function sendSlackDM(channel: string, text: string, blocks?: unknown[]) {
  if (!SLACK_BOT_TOKEN) return false;
  try {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text, blocks }),
    });
    const d = await r.json();
    if (!d.ok) console.warn("[slack]", d.error);
    return !!d.ok;
  } catch (e) {
    console.error("[slack] threw", (e as Error).message);
    return false;
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  let body: { mode?: Mode; dry_run?: boolean } = {};
  try {
    body = await req.json();
  } catch (_) { /* GET/no body */ }
  const mode: Mode = body.mode === "month_end" ? "month_end" : "weekly";
  const dryRun = !!body.dry_run;

  // month_end guard: only actually send within 3 days of month end
  if (mode === "month_end" && !isNearMonthEnd() && !dryRun) {
    return new Response(
      JSON.stringify({ ok: true, skipped: "not_near_month_end" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const DEDUP_WINDOW_HOURS = dedupWindowHours(mode);
  const sinceIso = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3600_000).toISOString();

  // Load recent audit log to dedupe
  const recentTargets = new Set<string>();
  if (DEDUP_WINDOW_HOURS > 0) {
    const { data: recent } = await admin
      .from("audit_logs")
      .select("entidade_id, payload, created_at")
      .eq("acao", "REGISTRATION_REMINDER_SENT")
      .gte("created_at", sinceIso)
      .limit(500);
    for (const row of recent || []) {
      const p = (row.payload as any) || {};
      if (p.target_person_id) recentTargets.add(String(p.target_person_id));
    }
  }

  const results = {
    mode,
    dry_run: dryRun,
    pending_reminded: 0,
    people_reminded: 0,
    skipped_dedup: 0,
    slack_missing: 0,
    errors: [] as string[],
  };

  // ---------- 1) pending_people awaiting approval ----------
  const pendingCutoff = new Date(Date.now() - 2 * 86400_000).toISOString();
  const pendingQuery = admin
    .from("pending_people")
    .select("id, nome, email, data_contrato, modelo_contrato, dia_pagamento, gestor_id, created_at, source")
    .eq("status", "PENDENTE");
  if (mode === "weekly") pendingQuery.lte("created_at", pendingCutoff);
  const { data: pendings, error: perr } = await pendingQuery;
  if (perr) results.errors.push(`pending_people: ${perr.message}`);

  // group by manager (fallback to admins)
  const byManager = new Map<string | "__admins__", any[]>();
  for (const p of pendings || []) {
    const key = p.gestor_id || "__admins__";
    if (!byManager.has(key)) byManager.set(key, []);
    byManager.get(key)!.push(p);
  }

  // load admins for __admins__ bucket
  let admins: PersonMini[] = [];
  if (byManager.has("__admins__")) {
    const { data } = await admin
      .from("people")
      .select("id, nome, email, slack_user_id")
      .or("is_admin.eq.true,papel.in.(DIRETOR,ADMIN)")
      .eq("ativo", true);
    admins = (data as PersonMini[]) || [];
  }

  // load managers referenced
  const mgrIds = [...byManager.keys()].filter((k) => k !== "__admins__") as string[];
  let mgrs: PersonMini[] = [];
  if (mgrIds.length) {
    const { data } = await admin
      .from("people")
      .select("id, nome, email, slack_user_id")
      .in("id", mgrIds)
      .eq("ativo", true);
    mgrs = (data as PersonMini[]) || [];
  }

  for (const [key, items] of byManager.entries()) {
    const recipients: PersonMini[] =
      key === "__admins__" ? admins : mgrs.filter((m) => m.id === key);

    const missingFields = (row: any) => {
      const miss: string[] = [];
      if (!row.email) miss.push("🔴 email corporativo (bloqueia login)");
      if (!row.data_contrato) miss.push("🟠 data de contrato");
      if (!row.modelo_contrato) miss.push("🟠 modelo de contrato");
      if (row.modelo_contrato === "PJ" && !row.dia_pagamento) miss.push("🟡 dia de pagamento (PJ)");
      return miss;
    };

    const lines = (items as any[]).slice(0, 20).map((p) => {
      const days = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400_000);
      const miss = missingFields(p);
      return `• *${p.nome}* — pendente há *${days}d* (${p.source})${
        miss.length ? `\n   Faltando: ${miss.join(", ")}` : ""
      }`;
    }).join("\n");

    const urgencyPrefix = mode === "month_end" ? "🗓️ *Fim de mês* — " : "";
    const text = `${urgencyPrefix}Você tem *${items.length}* cadastro(s) pendente(s) de aprovação:\n${lines}\n\nRevise em: ${SUPABASE_URL.replace(".supabase.co", "").replace("https://", "https://")} • /admin`;

    for (const r of recipients) {
      if (recentTargets.has(r.id)) { results.skipped_dedup++; continue; }
      // pref check
      const { data: pref } = await admin
        .from("notification_preferences")
        .select("registration_reminders_slack")
        .eq("person_id", r.id)
        .maybeSingle();
      if (pref && pref.registration_reminders_slack === false) continue;

      const slackId = r.slack_user_id || (r.email ? await slackLookupByEmail(r.email) : null);
      if (!slackId) { results.slack_missing++; continue; }

      if (!dryRun) {
        const sent = await sendSlackDM(slackId, text);
        if (sent) {
          results.pending_reminded++;
          await admin.from("audit_logs").insert({
            entidade: "pending_people",
            entidade_id: null,
            acao: "REGISTRATION_REMINDER_SENT",
            actor_id: null,
            payload: {
              mode,
              kind: "pending_approval",
              target_person_id: r.id,
              pending_count: items.length,
            },
          });
        }
      } else {
        results.pending_reminded++;
      }
    }
  }

  // ---------- 2) active people with incomplete profile ----------
  const { data: peopleAll, error: eerr } = await admin
    .from("people")
    .select("id, nome, email, slack_user_id, data_contrato, modelo_contrato, dia_pagamento, data_nascimento, profile_completed_at, gestor_id, ativo")
    .eq("ativo", true);
  if (eerr) results.errors.push(`people: ${eerr.message}`);

  const incompleteReasons = (p: any): string[] => {
    const miss: string[] = [];
    if (!p.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) miss.push("🔴 email corporativo válido (necessário para login)");
    if (!p.slack_user_id) miss.push("🔴 vincular usuário do Slack (necessário para notificações)");
    if (!p.data_contrato) miss.push("🟠 data de contrato");
    if (!p.modelo_contrato) miss.push("🟠 modelo de contrato");
    if (p.modelo_contrato === "PJ" && !p.dia_pagamento) miss.push("🟠 dia de pagamento (PJ)");
    if (!p.data_nascimento) miss.push("🟡 data de nascimento");
    if (!p.profile_completed_at) miss.push("🟠 completar perfil no sistema");
    return miss;
  };

  const incomplete = (peopleAll || []).filter((p) => incompleteReasons(p).length > 0);

  for (const p of incomplete) {
    if (recentTargets.has(p.id)) { results.skipped_dedup++; continue; }
    const reasons = incompleteReasons(p);

    // pref lookup
    const { data: pref } = await admin
      .from("notification_preferences")
      .select("registration_reminders_slack")
      .eq("person_id", p.id)
      .maybeSingle();
    const wantsSlack = !pref || pref.registration_reminders_slack !== false;

    const urgencyPrefix = mode === "month_end" ? "🗓️ *Fim de mês* — " : "";
    const selfText = `${urgencyPrefix}Olá *${p.nome}*, seu cadastro ainda está incompleto. Itens pendentes:\n${reasons.map((r) => `• ${r}`).join("\n")}\n\nComplete em: Configurações → Perfil.`;

    // to person themself
    let slackId = wantsSlack ? (p.slack_user_id || (p.email ? await slackLookupByEmail(p.email) : null)) : null;
    if (slackId) {
      if (!dryRun) {
        const sent = await sendSlackDM(slackId, selfText);
        if (sent) {
          results.people_reminded++;
          await admin.from("audit_logs").insert({
            entidade: "people",
            entidade_id: p.id,
            acao: "REGISTRATION_REMINDER_SENT",
            actor_id: null,
            payload: {
              mode,
              kind: "incomplete_profile_self",
              target_person_id: p.id,
              missing: reasons,
            },
          });
        }
      } else {
        results.people_reminded++;
      }
    } else if (wantsSlack) {
      results.slack_missing++;
    }

    // to manager (only month_end, to avoid spam)
    if (mode === "month_end" && p.gestor_id) {
      const mgr = (mgrs.find((m) => m.id === p.gestor_id)) || (await admin
        .from("people").select("id,nome,email,slack_user_id").eq("id", p.gestor_id).maybeSingle()).data as PersonMini | null;
      if (mgr) {
        const { data: mpref } = await admin
          .from("notification_preferences")
          .select("registration_reminders_slack")
          .eq("person_id", mgr.id)
          .maybeSingle();
        if (!mpref || mpref.registration_reminders_slack !== false) {
          const mid = mgr.slack_user_id || (mgr.email ? await slackLookupByEmail(mgr.email) : null);
          if (mid && !dryRun) {
            const mgrText = `${urgencyPrefix}Seu liderado *${p.nome}* está com cadastro incompleto:\n${reasons.map((r) => `• ${r}`).join("\n")}`;
            await sendSlackDM(mid, mgrText);
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
