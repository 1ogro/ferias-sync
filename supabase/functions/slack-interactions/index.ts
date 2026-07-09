import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeMessage, DEDUP_WINDOW_SECONDS } from "../kudos-send/lib.ts";


const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET")!;
const SLACK_BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function verifySlackRequest(body: string, timestamp: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const baseString = `v0:${timestamp}:${body}`;
  
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SLACK_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(baseString)
  );
  
  const hashArray = Array.from(new Uint8Array(signatureBytes));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const computedSignature = `v0=${hashHex}`;
  
  return computedSignature === signature;
}

/**
 * Look up an active `people` row by Slack identity — matches on
 * `slack_user_id`, then corporate `email`, then `email_pessoal`. When a match
 * is found via `email_pessoal` and the person has no `slack_user_id` yet,
 * back-fills it so future lookups hit the cheaper `slack_user_id` path.
 */
async function findPersonBySlackIdentity(
  supabase: any,
  args: { slackUserId?: string | null; email?: string | null },
): Promise<{ id: string; nome: string; papel: string | null } | null> {
  const slackUserId = args.slackUserId || null;
  const email = args.email ? args.email.trim() : null;
  const cols = "id, nome, papel, slack_user_id";

  if (slackUserId) {
    const { data } = await supabase
      .from("people").select(cols)
      .eq("slack_user_id", slackUserId).eq("ativo", true).maybeSingle();
    if (data) return { id: data.id, nome: data.nome, papel: data.papel ?? null };
  }

  if (!email) return null;

  for (const col of ["email", "email_pessoal"] as const) {
    const { data } = await supabase
      .from("people").select(cols)
      .ilike(col, email).eq("ativo", true).maybeSingle();
    if (data) {
      if (slackUserId && !data.slack_user_id) {
        await supabase.from("people").update({ slack_user_id: slackUserId }).eq("id", data.id);
      }
      return { id: data.id, nome: data.nome, papel: data.papel ?? null };
    }
  }

  return null;
}


async function resolveRespondent(slackUserId: string, supabase: any) {
  const r = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
  });
  const d = await r.json();
  const email = d?.user?.profile?.email ?? null;
  return await findPersonBySlackIdentity(supabase, { slackUserId, email });
}


async function awardPoints(supabase: any, personId: string, points: number, reason: string, sourceId: string) {
  const { error } = await supabase.rpc("award_points", {
    p_person_id: personId,
    p_points: points,
    p_reason: reason,
    p_source_id: sourceId,
  });
  if (error) console.error("[award_points] error:", error);
}

async function completePeerPair(
  supabase: any,
  runId: string,
  reviewerId: string,
  pairId?: string,
): Promise<{ pair_id: string; subject_id: string } | null> {
  // Marks a specific pair as completed (or falls back to the reviewer's single pair for legacy runs)
  // and awards reviewer points (deduped via source_id = pair_id).
  let pair: { id: string; subject_id: string; completed_at: string | null } | null = null;
  if (pairId) {
    const { data } = await supabase
      .from("peer_review_pairs")
      .select("id, subject_id, completed_at")
      .eq("id", pairId)
      .maybeSingle();
    pair = data ?? null;
  } else {
    // Legacy fallback (single pair per reviewer)
    const { data } = await supabase
      .from("peer_review_pairs")
      .select("id, subject_id, completed_at")
      .eq("run_id", runId)
      .eq("reviewer_id", reviewerId)
      .maybeSingle();
    pair = data ?? null;
  }
  if (!pair) return null;
  const wasAlreadyCompleted = !!pair.completed_at;
  if (!wasAlreadyCompleted) {
    await supabase.from("peer_review_pairs").update({ completed_at: new Date().toISOString() }).eq("id", pair.id);
    // Reuse the K frozen on the run so audit entries always reflect the same value
    // that was used when pairs were generated for this execution.
    const { data: runRow } = await supabase
      .from("pulse_runs")
      .select("peer_reviews_per_reviewer, peer_pairing_strategy")
      .eq("id", runId)
      .maybeSingle();
    await supabase.from("audit_logs").insert({
      entidade: "peer_review_pairs",
      entidade_id: pair.id,
      acao: "PEER_PAIR_COMPLETED",
      actor_id: reviewerId,
      payload: {
        run_id: runId,
        pair_id: pair.id,
        reviewer_id: reviewerId,
        subject_id: pair.subject_id,
        k: runRow?.peer_reviews_per_reviewer ?? null,
        peer_pairing_strategy: runRow?.peer_pairing_strategy ?? null,
      },
    });
  }
  await awardPoints(supabase, reviewerId, 8, "peer_review", pair.id);
  return { pair_id: pair.id, subject_id: pair.subject_id };
}


async function bumpResponseCount(runId: string, supabase: any) {
  const { count } = await supabase
    .from("pulse_responses").select("*", { count: "exact", head: true }).eq("run_id", runId);
  await supabase.from("pulse_runs").update({ responses_count: count || 0 }).eq("id", runId);
}

async function markRecipientResponded(supabase: any, runId: string, personId: string) {
  try {
    // Recount completed pairs and only mark responded when all pairs are done (peer surveys)
    const { data: rec } = await supabase
      .from("pulse_run_recipients")
      .select("id, pairs_total")
      .eq("run_id", runId)
      .eq("person_id", personId)
      .maybeSingle();
    if (!rec) return;

    let pairsCompleted = 0;
    if ((rec.pairs_total || 0) > 0) {
      const { count } = await supabase
        .from("peer_review_pairs")
        .select("*", { count: "exact", head: true })
        .eq("run_id", runId)
        .eq("reviewer_id", personId)
        .not("completed_at", "is", null);
      pairsCompleted = count || 0;
    }

    const allDone = (rec.pairs_total || 0) === 0 || pairsCompleted >= (rec.pairs_total || 0);
    await supabase
      .from("pulse_run_recipients")
      .update({
        pairs_completed: pairsCompleted,
        ...(allDone ? { responded_at: new Date().toISOString() } : {}),
      })
      .eq("id", rec.id);
  } catch (e) {
    console.error("[markRecipientResponded] error:", e);
  }
}

async function postEphemeralAck(payload: any, text: string) {
  if (!payload.channel?.id || !payload.user?.id) return;
  await fetch("https://slack.com/api/chat.postEphemeral", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel: payload.channel.id, user: payload.user.id, text }),
  });
}

async function findRecentKudoDuplicate(
  supabase: any,
  args: {
    senderPersonId: string | null;
    senderSlackUserId: string | null;
    recipientPersonId: string | null;
    recipientSlackUserId: string | null;
    category: string;
    message: string;
  },
) {
  const senderFilters = [
    args.senderPersonId ? `from_person_id.eq.${args.senderPersonId}` : null,
    args.senderSlackUserId ? `from_slack_user_id.eq.${args.senderSlackUserId}` : null,
  ].filter(Boolean);
  const recipientFilters = [
    args.recipientPersonId ? `to_person_id.eq.${args.recipientPersonId}` : null,
    args.recipientSlackUserId ? `to_slack_user_id.eq.${args.recipientSlackUserId}` : null,
  ].filter(Boolean);
  if (senderFilters.length === 0 || recipientFilters.length === 0) return null;

  const nowMs = Date.now();
  const cutoffMs = nowMs - DEDUP_WINDOW_SECONDS * 1000;
  const normalizedMessage = normalizeMessage(args.message);
  const sinceIso = new Date(cutoffMs).toISOString();

  let query = supabase
    .from("kudos")
    .select("id, message, category, from_person_id, from_slack_user_id, to_person_id, to_slack_user_id, created_at")
    .eq("category", args.category)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(50);

  query = query.or(senderFilters.join(","));
  query = query.or(recipientFilters.join(","));

  const { data: recentRows, error } = await query;
  if (error) {
    console.error("[kudos dedup] lookup error:", error);
    return null;
  }

  return (recentRows || []).find((k: any) => {
    const senderMatches =
      (!!args.senderPersonId && k.from_person_id === args.senderPersonId) ||
      (!!args.senderSlackUserId && k.from_slack_user_id === args.senderSlackUserId);
    const recipientMatches =
      (!!args.recipientPersonId && k.to_person_id === args.recipientPersonId) ||
      (!!args.recipientSlackUserId && k.to_slack_user_id === args.recipientSlackUserId);
    const createdAt = Date.parse(k.created_at);
    return senderMatches &&
      recipientMatches &&
      k.category === args.category &&
      normalizeMessage(k.message) === normalizedMessage &&
      !Number.isNaN(createdAt) &&
      createdAt >= cutoffMs;
  }) || null;
}

export async function recordRecipientDmAudit(
  supabase: any,
  kudoId: string | null | undefined,
  recipientPersonId: string | null | undefined,
  status: "sent" | "failed" | "no_slack_id" | "no_email",
  extras: Record<string, unknown> = {},
) {
  if (!kudoId || !recipientPersonId) return;
  try {
    await supabase.from("audit_logs").insert({
      entidade: "kudos",
      entidade_id: `${kudoId}:${recipientPersonId}`,
      acao: "KUDOS_RECIPIENT_DM",
      payload: { kudo_id: kudoId, recipient_id: recipientPersonId, status, ...extras },
    });
  } catch (e: any) {
    console.error("[recordRecipientDmAudit] insert failed:", e?.message || e);
  }
}

async function notifyRecipientDM(
  supabase: any,
  toPersonId: string,
  fromName: string,
  category: string,
  message: string,
  context: string,
  kudoId?: string,
) {
  try {
    const { data: toP } = await supabase
      .from("people")
      .select("email, nome")
      .eq("id", toPersonId)
      .maybeSingle();
    if (!toP?.email) {
      console.log(`[${context}] dm skipped: recipient has no email (${toPersonId})`);
      await recordRecipientDmAudit(supabase, kudoId, toPersonId, "no_email", { reason: "no_email_on_people" });
      return;
    }

    const lookupRes = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(toP.email)}`,
      { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
    );
    const lookup = await lookupRes.json();
    if (!lookup.ok || !lookup.user?.id) {
      console.log(`[${context}] dm skipped: slack user not found for ${toP.email} (${lookup.error || "unknown"})`);
      await recordRecipientDmAudit(supabase, kudoId, toPersonId, "no_slack_id", { email: toP.email, error: lookup.error || "users_not_found" });
      return;
    }
    const slackUserId = lookup.user.id;

    const openRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ users: slackUserId }),
    });
    const open = await openRes.json();
    const channelId = open?.channel?.id;
    if (!open.ok || !channelId) {
      console.log(`[${context}] dm skipped: conversations.open failed (${open.error || "unknown"})`);
      await recordRecipientDmAudit(supabase, kudoId, toPersonId, "failed", { stage: "conversations.open", error: open.error || "unknown" });
      return;
    }

    const CATEGORY_LABEL_LOCAL: Record<string, string> = {
      teamwork: "🤝 Trabalho em equipe",
      innovation: "💡 Inovação",
      delivery: "🚀 Entrega",
      leadership: "🏆 Liderança",
      customer: "❤️ Foco no cliente",
    };
    const catLabel = CATEGORY_LABEL_LOCAL[category] || "🍪";
    const text =
      `🍪 *Você ganhou um biscoito!*\n` +
      `${catLabel}\n` +
      `De: *${fromName}*\n` +
      `> ${message}\n\n` +
      `Veja seu feed em /engagement`;

    const postRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: channelId, text }),
    });
    const post = await postRes.json();
    if (!post.ok) {
      console.log(`[${context}] dm skipped: chat.postMessage failed (${post.error || "unknown"})`);
      await recordRecipientDmAudit(supabase, kudoId, toPersonId, "failed", { stage: "chat.postMessage", error: post.error || "unknown" });
      return;
    }
    console.log(`[${context}] dm sent to ${slackUserId}`);
    await recordRecipientDmAudit(supabase, kudoId, toPersonId, "sent", { slack_user_id: slackUserId, channel: channelId, ts: post.ts });
  } catch (e: any) {
    console.error(`[${context}] dm error:`, e?.message || e);
    await recordRecipientDmAudit(supabase, kudoId, toPersonId, "failed", { stage: "exception", error: e?.message || String(e) });
  }
}

// ============ Shared helpers (parity with /biscoito) ============

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
  for (let i = 0; i < 20; i++) {
    const url = `https://slack.com/api/users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } });
    const d = await r.json();
    if (!d.ok) { console.error("[users.list]", d.error); break; }
    for (const m of (d.members || []) as SlackMember[]) {
      if (m.deleted || m.is_bot || m.id === "USLACKBOT") continue;
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

const normEmail = (v: unknown): string => typeof v === "string" ? v.trim().toLowerCase() : "";
const normName = (v: unknown): string => {
  if (typeof v !== "string") return "";
  return v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
};

async function ensurePendingPerson(
  supabase: any,
  args: { slackId: string | null; email: string | null; nome: string | null; createdBy: string | null; source?: string }
) {
  const { slackId, email, nome, createdBy } = args;
  const source = args.source || "slack_biscoito";
  if (!slackId && !email) return;
  try {
    // Skip when the Slack identity already maps to an existing person — avoids
    // duplicate pending rows for collaborators who use a personal email in Slack.
    const existing = await findPersonBySlackIdentity(supabase, { slackUserId: slackId, email });
    if (existing) return;

    const { data: rows } = await supabase.from("pending_people").select("id, slack_request_count").eq("status", "PENDENTE");
    const match = (rows || []).find((r: any) =>
      (slackId && r.slack_user_id === slackId) ||
      (email && r.email && r.email.toLowerCase() === email.toLowerCase())
    );
    if (match) {
      await supabase.from("pending_people").update({
        slack_request_count: (match.slack_request_count || 0) + 1,
        last_slack_request_at: new Date().toISOString(),
        slack_user_id: slackId || undefined,
      }).eq("id", match.id);
    } else {
      await supabase.from("pending_people").insert({
        nome: nome || email || "Usuário do Slack",
        email,
        papel: "COLABORADOR",
        status: "PENDENTE",
        source,
        slack_user_id: slackId,
        slack_request_count: 1,
        last_slack_request_at: new Date().toISOString(),
        created_by: createdBy,
      });
    }
  } catch (e: any) {
    console.error("[ensurePendingPerson] error:", e?.message || e);
  }
}

async function notifyAdminsPending(
  supabase: any,
  args: { pendingFrom: boolean; pendingTo: boolean; senderName: string; senderEmail: string | null; toName: string | null; toEmail: string | null; origin: string }
) {
  try {
    const { data: adminsRaw } = await supabase
      .from("people")
      .select("email, papel, is_admin")
      .eq("ativo", true)
      .or("is_admin.eq.true,papel.eq.DIRETOR");
    const seen = new Set<string>();
    const admins = (adminsRaw || []).filter((a: any) => {
      const key = (a.email || "").toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const lines: string[] = [];
    if (args.pendingFrom) lines.push(`• *${args.senderName} enviou* um biscoito (${args.senderEmail || "(sem email)"})`);
    if (args.pendingTo) lines.push(`• *${(args.toName || "Colega")} recebeu* um biscoito (${args.toEmail || "(sem email)"})`);
    const text = `🔔 *Novo cadastro pendente via ${args.origin}*\n${lines.join("\n")}\n\nAprove em Administração → Cadastros Pendentes para creditar os pontos retroativamente.`;
    for (const a of admins as Array<{ email: string | null }>) {
      if (!a.email) continue;
      const lookupRes = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(a.email)}`,
        { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } });
      const lookup = await lookupRes.json();
      if (!lookup.ok || !lookup.user?.id) continue;
      const openRes = await fetch("https://slack.com/api/conversations.open", {
        method: "POST",
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ users: lookup.user.id }),
      });
      const open = await openRes.json();
      if (!open.ok || !open.channel?.id) continue;
      await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel: open.channel.id, text }),
      });
    }
  } catch (e: any) {
    console.error("[notifyAdminsPending] error:", e?.message || e);
  }
}






serve(async (req) => {
  try {
    // Slack retries view_submissions after 3s if it doesn't get an ack. When
    // the handler is slow (Slack API calls, DB writes, notifications), the
    // original request may still be running when the retry arrives, so the
    // dedup lookup on the retry sees an empty table and inserts a second
    // kudo. Short-circuit retries with a 200 so Slack stops resending and no
    // duplicate processing happens.
    const retryNum = req.headers.get("X-Slack-Retry-Num");
    const retryReason = req.headers.get("X-Slack-Retry-Reason");
    if (retryNum) {
      console.log(`[slack-interactions] ignoring retry num=${retryNum} reason=${retryReason ?? "?"}`);
      return new Response("", { status: 200 });
    }

    const body = await req.text();
    const timestamp = req.headers.get("X-Slack-Request-Timestamp") || "";
    const signature = req.headers.get("X-Slack-Signature") || "";

    // Verify request is from Slack
    const isValid = await verifySlackRequest(body, timestamp, signature);
    if (!isValid) {
      console.error("Invalid Slack signature");
      return new Response("Unauthorized", { status: 401 });
    }

    // Slack envia application/x-www-form-urlencoded com `payload=<json>`.
    // URLSearchParams decodifica `+` como espaço; decodeURIComponent não — por isso
    // mensagens de texto vinham com `+` no lugar dos espaços.
    const payload = JSON.parse(new URLSearchParams(body).get("payload") || "{}");
    console.log("Slack interaction payload type:", payload.type);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ============ PULSE / KUDOS FLOW ============

    const CATEGORY_LABEL: Record<string, string> = {
      teamwork: "🤝 Trabalho em equipe",
      innovation: "💡 Inovação",
      delivery: "🚀 Entrega",
      leadership: "🏆 Liderança",
      customer: "❤️ Foco no cliente",
    };

    // view_submission for kudos modal
    if (payload.type === "view_submission" && payload.view?.callback_id?.startsWith("kudos_submit:")) {
      const [, surveyId] = payload.view.callback_id.split(":");
      const v = payload.view.state.values || {};
      const toRaw: string = v.kudo_to_block?.kudo_to_select?.selected_option?.value || "";
      const category = v.kudo_cat_block?.kudo_cat_select?.selected_option?.value || "teamwork";
      const message = (v.kudo_msg_block?.kudo_msg_input?.value || "").trim();
      const shareSelected = (v.kudo_share_block?.kudo_share_check?.selected_options || []).length > 0;
      let meta: { kudos_channel?: string | null; origin_channel_id?: string | null } = {};
      try { meta = JSON.parse(payload.view.private_metadata || "{}"); } catch (_) { /* noop */ }

      const slackUserId = payload.user.id;

      // Resolve sender (app user OR slack-only)
      const senderInfoRes = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
        headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      });
      const senderInfo = await senderInfoRes.json();
      const senderEmail: string | null = senderInfo?.user?.profile?.email ?? null;
      const senderName: string =
        senderInfo?.user?.profile?.display_name?.trim() ||
        senderInfo?.user?.profile?.real_name?.trim() ||
        senderInfo?.user?.real_name?.trim() ||
        senderInfo?.user?.name ||
        "Alguém";

      let senderPersonId: string | null = null;
      let senderPersonNome: string | null = null;
      {
        const sp = await findPersonBySlackIdentity(supabase, { slackUserId, email: senderEmail });
        if (sp) { senderPersonId = sp.id; senderPersonNome = sp.nome; }
      }

      const senderDisplay = senderPersonNome || senderName;

      // Resolve recipient (app: or slack:)
      const errors: Record<string, string> = {};
      if (!toRaw) errors["kudo_to_block"] = "Selecione um colega.";
      if (!message || message.length < 3) errors["kudo_msg_block"] = "Mensagem muito curta.";
      if (message.length > 500) errors["kudo_msg_block"] = "Máximo 500 caracteres.";

      let toPersonId: string | null = null;
      let toPersonNome: string | null = null;
      let toSlackUserId: string | null = null;
      let toSlackEmail: string | null = null;
      let toSlackName: string | null = null;

      if (toRaw.startsWith("app:")) {
        const pid = toRaw.slice(4);
        const { data: tp } = await supabase.from("people").select("id, nome, ativo").eq("id", pid).maybeSingle();
        if (!tp || !tp.ativo) errors["kudo_to_block"] = "Destinatário inativo.";
        else { toPersonId = tp.id; toPersonNome = tp.nome; }
      } else if (toRaw.startsWith("slack:")) {
        toSlackUserId = toRaw.slice(6);
        const r = await fetch(`https://slack.com/api/users.info?user=${toSlackUserId}`, {
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
        });
        const d = await r.json();
        toSlackEmail = d?.user?.profile?.email ?? null;
        toSlackName =
          d?.user?.profile?.display_name?.trim() ||
          d?.user?.profile?.real_name?.trim() ||
          d?.user?.real_name?.trim() ||
          d?.user?.name ||
          "Colega";
        {
          const tp = await findPersonBySlackIdentity(supabase, { slackUserId: toSlackUserId, email: toSlackEmail });
          if (tp) { toPersonId = tp.id; toPersonNome = tp.nome; }
        }

      } else if (toRaw) {
        errors["kudo_to_block"] = "Seleção inválida.";
      }

      if (senderPersonId && toPersonId && senderPersonId === toPersonId) {
        errors["kudo_to_block"] = "Não dá para mandar kudos pra si mesmo 😉";
      }
      if (toSlackUserId && toSlackUserId === slackUserId) {
        errors["kudo_to_block"] = "Não dá para mandar kudos pra si mesmo 😉";
      }

      if (Object.keys(errors).length) {
        return new Response(JSON.stringify({ response_action: "errors", errors }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const channelToPost = shareSelected && meta.kudos_channel ? meta.kudos_channel : null;
      const pendingFrom = !senderPersonId;
      const pendingTo = !toPersonId;

      const dup = await findRecentKudoDuplicate(supabase, {
        senderPersonId,
        senderSlackUserId: slackUserId,
        recipientPersonId: toPersonId,
        recipientSlackUserId: toSlackUserId,
        category,
        message,
      });
      if (dup) {
        console.log(`[kudos_submit] deduped duplicate of ${dup.id} from=${senderPersonId ?? `slack:${slackUserId}`} to=${toPersonId ?? `slack:${toSlackUserId}`}`);
        return new Response(JSON.stringify({ response_action: "clear" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const { data: kudo, error: insErr } = await supabase.from("kudos").insert({

        from_person_id: senderPersonId,
        to_person_id: toPersonId,
        from_slack_user_id: pendingFrom ? slackUserId : null,
        from_slack_email: pendingFrom ? senderEmail : null,
        from_slack_name: pendingFrom ? senderName : null,
        to_slack_user_id: pendingTo ? toSlackUserId : null,
        to_slack_email: pendingTo ? toSlackEmail : null,
        to_slack_name: pendingTo ? toSlackName : null,
        pending_from: pendingFrom,
        pending_to: pendingTo,
        message,
        category,
        slack_channel_posted: channelToPost,
      }).select().single();

      if (insErr || !kudo) {
        console.error("[kudos_submit] insert error:", insErr);
        return new Response(
          JSON.stringify({ response_action: "errors", errors: { kudo_msg_block: "Não consegui registrar seu kudos. Tente novamente." } }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (toPersonId) await awardPoints(supabase, toPersonId, 10, "kudo_received", kudo.id);
      if (senderPersonId) await awardPoints(supabase, senderPersonId, 2, "kudo_given", kudo.id);

      if (pendingFrom) await ensurePendingPerson(supabase, { slackId: slackUserId, email: senderEmail, nome: senderName, createdBy: senderPersonId });
      if (pendingTo) await ensurePendingPerson(supabase, { slackId: toSlackUserId, email: toSlackEmail, nome: toSlackName, createdBy: senderPersonId });

      if (pendingFrom || pendingTo) {
        // @ts-ignore EdgeRuntime
        EdgeRuntime.waitUntil(notifyAdminsPending(supabase, {
          pendingFrom, pendingTo,
          senderName, senderEmail,
          toName: toSlackName, toEmail: toSlackEmail,
          origin: "pulse de kudos",
        }));
      }

      // Card
      const toLabel = (toPersonNome || toSlackName || "Colega") + (pendingTo ? " _(cadastro pendente)_" : "");
      const fromLabel = senderDisplay + (pendingFrom ? " _(cadastro pendente)_" : "");
      const cardText = `${CATEGORY_LABEL[category] || "🎉"} *${fromLabel}* deu kudos para *${toLabel}*\n> ${message}`;

      const postToChannel = async (channel: string, label: string) => {
        const r = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel, text: cardText }),
        });
        const j = await r.json();
        if (!j.ok) console.log(`[kudos_submit] ${label} post skipped: ${j.error || "unknown"} (channel=${channel})`);
      };

      const origin = meta.origin_channel_id;
      if (origin && !origin.startsWith("D")) await postToChannel(origin, "origin");
      if (channelToPost) await postToChannel(channelToPost, "share");

      // DM destinatário
      if (toPersonId) {
        await notifyRecipientDM(supabase, toPersonId, senderDisplay, category, message, "kudos_submit", kudo.id);
      } else if (toSlackUserId) {
        try {
          const openRes = await fetch("https://slack.com/api/conversations.open", {
            method: "POST",
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ users: toSlackUserId }),
          });
          const open = await openRes.json();
          if (open.ok && open.channel?.id) {
            const catLabel = CATEGORY_LABEL[category] || "🎉";
            const txt =
              `🎉 *Você ganhou um kudos!*\n${catLabel}\nDe: *${senderDisplay}*\n> ${message}\n\n` +
              `_Seu cadastro no app ainda está pendente. Assim que for aprovado, os pontos entram no painel de Engajamento._`;
            await fetch("https://slack.com/api/chat.postMessage", {
              method: "POST",
              headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify({ channel: open.channel.id, text: txt }),
            });
          }
        } catch (e: any) {
          console.error("[kudos_submit] slack-only recipient DM error:", e?.message || e);
        }
      }

      if (toPersonId) {
        supabase.functions.invoke("kudos-notify-managers", { body: { kudo_id: kudo.id } })
          .catch((e: any) => console.error("[kudos_submit] notify invoke failed", e?.message));
      }

      console.log(`[kudos_submit] inserted kudo ${kudo.id} from=${senderPersonId ?? `slack:${slackUserId}`} to=${toPersonId ?? `slack:${toSlackUserId}`}`);
      return new Response(JSON.stringify({ response_action: "clear" }), {
        headers: { "Content-Type": "application/json" },
      });
    }


    // view_submission for /biscoito slash command
    if (payload.type === "view_submission" && payload.view?.callback_id === "biscoito_submit") {
      const v = payload.view.state.values || {};
      const toRawSingle: string = v.kudo_to_block?.kudo_to_select?.selected_option?.value || "";
      const toRawMulti: string[] = (v.kudo_to_multi_block?.kudo_to_multi_select?.selected_options || [])
        .map((o: any) => o?.value).filter((x: any) => typeof x === "string" && x.length > 0);
      const category = v.kudo_cat_block?.kudo_cat_select?.selected_option?.value || "teamwork";
      const message = (v.kudo_msg_block?.kudo_msg_input?.value || "").trim();
      const shareSelected = (v.kudo_share_block?.kudo_share_check?.selected_options || []).length > 0;
      let meta: { channel_id?: string; origin_channel_id?: string | null } = {};
      try { meta = JSON.parse(payload.view.private_metadata || "{}"); } catch (_) { /* noop */ }

      const slackUserId = payload.user.id;

      // Junta destinatários (dedup)
      const toRawAll = Array.from(new Set([
        ...(toRawSingle ? [toRawSingle] : []),
        ...toRawMulti,
      ]));

      // ---- Resolve sender (app user OR slack-only) ----
      // Try slack_user_id first to avoid a users.info roundtrip in the common case.
      let senderPersonId: string | null = null;
      let senderPersonNome: string | null = null;
      let senderPapel: string | null = null;
      let senderEmail: string | null = null;
      let senderName: string = "Alguém";
      {
        const sp = await findPersonBySlackIdentity(supabase, { slackUserId, email: null });
        if (sp) { senderPersonId = sp.id; senderPersonNome = sp.nome; senderPapel = sp.papel; senderName = sp.nome; }
      }
      // Only hit Slack users.info if we still can't identify the sender
      // (need email/name for kudos row + pending_people record).
      if (!senderPersonId) {
        try {
          const senderInfoRes = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
          });
          const senderInfo = await senderInfoRes.json();
          senderEmail = senderInfo?.user?.profile?.email ?? null;
          senderName =
            senderInfo?.user?.profile?.display_name?.trim() ||
            senderInfo?.user?.profile?.real_name?.trim() ||
            senderInfo?.user?.real_name?.trim() ||
            senderInfo?.user?.name ||
            "Alguém";
          const sp = await findPersonBySlackIdentity(supabase, { slackUserId, email: senderEmail });
          if (sp) { senderPersonId = sp.id; senderPersonNome = sp.nome; senderPapel = sp.papel; senderName = sp.nome; }
        } catch (e) {
          console.warn("[biscoito_submit] sender users.info failed:", e);
        }
      }

      const senderDisplay = senderPersonNome || senderName;

      // ---- Validações básicas ----
      const errors: Record<string, string> = {};
      if (toRawAll.length === 0) errors["kudo_to_block"] = "Selecione ao menos um colega.";
      if (!message || message.length < 3) errors["kudo_msg_block"] = "Mensagem muito curta.";
      if (message.length > 500) errors["kudo_msg_block"] = "Máximo 500 caracteres.";

      // Regras de multi-destinatário
      if (toRawAll.length > 1) {
        if (category !== "delivery") {
          errors["kudo_cat_block"] = "Enviar para vários colegas só é permitido na categoria Entrega 🚀.";
        }
        if (senderPapel !== "GESTOR" && senderPapel !== "DIRETOR") {
          errors["kudo_to_multi_block"] = "Apenas gestores e diretores podem enviar para vários colegas.";
        }
        if (toRawAll.length > 10) {
          errors["kudo_to_multi_block"] = "Máximo de 10 colegas por envio.";
        }
      }

      if (Object.keys(errors).length) {
        return new Response(JSON.stringify({ response_action: "errors", errors }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // ---- Resolve cada destinatário ----
      type Recipient = {
        toRaw: string;
        personId: string | null;
        personNome: string | null;
        slackUserId: string | null;
        slackEmail: string | null;
        slackName: string | null;
      };
      const recipients: Recipient[] = [];
      for (const toRaw of toRawAll) {
        let personId: string | null = null;
        let personNome: string | null = null;
        let sUid: string | null = null;
        let sEmail: string | null = null;
        let sName: string | null = null;

        if (toRaw.startsWith("app:")) {
          const pid = toRaw.slice(4);
          const { data: tp } = await supabase.from("people").select("id, nome, ativo").eq("id", pid).maybeSingle();
          if (tp && tp.ativo) { personId = tp.id; personNome = tp.nome; }
        } else if (toRaw.startsWith("slack:")) {
          sUid = toRaw.slice(6);
          // Try to identify by slack_user_id first (no Slack roundtrip needed)
          const tpFast = await findPersonBySlackIdentity(supabase, { slackUserId: sUid, email: null });
          if (tpFast) {
            personId = tpFast.id;
            personNome = tpFast.nome;
            sName = tpFast.nome;
          } else {
            // Fall back to users.info to fetch email/name for pending record
            const r = await fetch(`https://slack.com/api/users.info?user=${sUid}`, {
              headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
            });
            const d = await r.json();
            sEmail = d?.user?.profile?.email ?? null;
            sName =
              d?.user?.profile?.display_name?.trim() ||
              d?.user?.profile?.real_name?.trim() ||
              d?.user?.real_name?.trim() ||
              d?.user?.name ||
              "Colega";
            const tp = await findPersonBySlackIdentity(supabase, { slackUserId: sUid, email: sEmail });
            if (tp) { personId = tp.id; personNome = tp.nome; }
          }
        }

        // Filtra: não pode mandar pra si mesmo
        if (senderPersonId && personId && senderPersonId === personId) continue;
        if (sUid && sUid === slackUserId) continue;
        if (!personId && !sUid) continue;
        recipients.push({ toRaw, personId, personNome, slackUserId: sUid, slackEmail: sEmail, slackName: sName });
      }

      if (recipients.length === 0) {
        return new Response(JSON.stringify({
          response_action: "errors",
          errors: { kudo_to_block: "Nenhum destinatário válido." }
        }), { headers: { "Content-Type": "application/json" } });
      }

      const channelToPost = shareSelected && meta.channel_id ? meta.channel_id : null;

      // Ensure pending_people helper (mantém logic existente inline)
      const ensurePending = async (slackId: string | null, email: string | null, nome: string | null) => {
        if (!slackId && !email) return;
        try {
          const existingPerson = await findPersonBySlackIdentity(supabase, { slackUserId: slackId, email });
          if (existingPerson) return;

          const { data: rows } = await supabase.from("pending_people").select("id, slack_request_count").eq("status", "PENDENTE");
          const match = (rows || []).find((r: any) =>
            (slackId && r.slack_user_id === slackId) ||
            (email && r.email && r.email.toLowerCase() === email.toLowerCase())
          );
          if (match) {
            await supabase.from("pending_people").update({
              slack_request_count: (match.slack_request_count || 0) + 1,
              last_slack_request_at: new Date().toISOString(),
              slack_user_id: slackId || undefined,
            }).eq("id", match.id);
          } else {
            await supabase.from("pending_people").insert({
              nome: nome || email || "Usuário do Slack",
              email: email,
              papel: "COLABORADOR",
              status: "PENDENTE",
              source: "slack_biscoito",
              slack_user_id: slackId,
              slack_request_count: 1,
              last_slack_request_at: new Date().toISOString(),
              created_by: senderPersonId,
            });
          }
        } catch (e: any) {
          console.error("[biscoito_submit] ensurePending error:", e?.message || e);
        }
      };

      // ---- Loop de inserção por destinatário ----
      const inserted: Array<{ kudo: any; recipient: Recipient; pendingTo: boolean }> = [];
      const pendingFrom = !senderPersonId;
      const deduped: Recipient[] = [];

      for (const rec of recipients) {
        const pendingTo = !rec.personId;

        const dup = await findRecentKudoDuplicate(supabase, {
          senderPersonId,
          senderSlackUserId: slackUserId,
          recipientPersonId: rec.personId,
          recipientSlackUserId: rec.slackUserId,
          category,
          message,
        });
        if (dup) {
          console.log(`[biscoito_submit] deduped duplicate of ${dup.id} from=${senderPersonId ?? `slack:${slackUserId}`} to=${rec.personId ?? `slack:${rec.slackUserId}`}`);
          deduped.push(rec);
          continue;
        }

        const { data: kudo, error: insErr } = await supabase.from("kudos").insert({
          from_person_id: senderPersonId,
          to_person_id: rec.personId,
          from_slack_user_id: pendingFrom ? slackUserId : null,
          from_slack_email: pendingFrom ? senderEmail : null,
          from_slack_name: pendingFrom ? senderName : null,
          to_slack_user_id: pendingTo ? rec.slackUserId : null,
          to_slack_email: pendingTo ? rec.slackEmail : null,
          to_slack_name: pendingTo ? rec.slackName : null,
          pending_from: pendingFrom,
          pending_to: pendingTo,
          message,
          category,
          slack_channel_posted: channelToPost,
        }).select().single();

        if (insErr || !kudo) {
          console.error("[biscoito_submit] insert error:", insErr);
          continue;
        }
        inserted.push({ kudo, recipient: rec, pendingTo });

        if (rec.personId) await awardPoints(supabase, rec.personId, 10, "kudo_received", kudo.id);
        if (senderPersonId) await awardPoints(supabase, senderPersonId, 2, "kudo_given", kudo.id);

        if (pendingTo) await ensurePending(rec.slackUserId, rec.slackEmail, rec.slackName);
      }

      if (inserted.length === 0 && deduped.length > 0) {
        return new Response(JSON.stringify({ response_action: "clear" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (inserted.length === 0) {
        return new Response(
          JSON.stringify({ response_action: "errors", errors: { kudo_msg_block: "Não consegui registrar seu biscoito. Tente novamente." } }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (pendingFrom) await ensurePending(slackUserId, senderEmail, senderName);

      // Notifica admins quando há lado pendente (best-effort, uma vez só)
      const hasPending = pendingFrom || inserted.some((x) => x.pendingTo);
      if (hasPending) {
        const notifyAdmins = async () => {
          try {
            const { data: adminsRaw } = await supabase
              .from("people")
              .select("email, nome, papel, is_admin")
              .eq("ativo", true)
              .or("is_admin.eq.true,papel.eq.DIRETOR");
            const seen = new Set<string>();
            const admins = (adminsRaw || []).filter((a: any) => {
              const key = (a.email || "").toLowerCase();
              if (!key || seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            const parts: string[] = [];
            if (pendingFrom) parts.push(`• *${senderName} enviou* biscoitos (${senderEmail || "(sem email)"})`);
            for (const it of inserted) {
              if (it.pendingTo) parts.push(`• *${(it.recipient.slackName || "Colega")} recebeu* um biscoito (${it.recipient.slackEmail || "(sem email)"})`);
            }
            const text = `🔔 *Novo cadastro pendente via /biscoito*\n${parts.join("\n")}\n\nAprove em Administração → Cadastros Pendentes para creditar os pontos retroativamente.`;
            for (const a of (admins || []) as Array<{ email: string | null }>) {
              if (!a.email) continue;
              const lookupRes = await fetch(
                `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(a.email)}`,
                { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
              );
              const lookup = await lookupRes.json();
              if (!lookup.ok || !lookup.user?.id) continue;
              const openRes = await fetch("https://slack.com/api/conversations.open", {
                method: "POST",
                headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
                body: JSON.stringify({ users: lookup.user.id }),
              });
              const open = await openRes.json();
              if (!open.ok || !open.channel?.id) continue;
              await fetch("https://slack.com/api/chat.postMessage", {
                method: "POST",
                headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
                body: JSON.stringify({ channel: open.channel.id, text }),
              });
            }
          } catch (e: any) {
            console.error("[biscoito_submit] notifyAdmins error:", e?.message || e);
          }
        };
        // @ts-ignore EdgeRuntime disponível no Supabase
        EdgeRuntime.waitUntil(notifyAdmins());
      }

      // ---- Card no canal (uma mensagem consolidada se >1) ----
      const fromLabel = senderDisplay + (pendingFrom ? " _(cadastro pendente)_" : "");
      const catLabel = CATEGORY_LABEL[category] || "🍪";
      const toLabels = inserted.map((it) =>
        (it.recipient.personNome || it.recipient.slackName || "Colega") + (it.pendingTo ? " _(cadastro pendente)_" : "")
      );
      const cardText = inserted.length === 1
        ? `${catLabel} *${fromLabel}* deu um biscoito para *${toLabels[0]}*\n> ${message}`
        : `${catLabel} *${fromLabel}* deu biscoitos para ${toLabels.map((n) => `*${n}*`).join(", ")}\n> ${message}`;

      // All downstream Slack work (channel post + DMs + manager notifications) runs
      // in background so the view_submission ack returns within Slack's 3s window.
      const postBiscoitoSideEffects = async () => {
        const postToChannel = async (channel: string, label: string) => {
          try {
            const r = await fetch("https://slack.com/api/chat.postMessage", {
              method: "POST",
              headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify({ channel, text: cardText }),
            });
            const j = await r.json();
            if (!j.ok) console.log(`[biscoito_submit] ${label} post skipped: ${j.error || "unknown"} (channel=${channel})`);
          } catch (e: any) {
            console.error(`[biscoito_submit] ${label} post error:`, e?.message || e);
          }
        };

        const origin = meta.origin_channel_id;
        if (origin && !origin.startsWith("D")) await postToChannel(origin, "origin");
        if (channelToPost) await postToChannel(channelToPost, "share");

        for (const it of inserted) {
          if (it.recipient.personId) {
            await notifyRecipientDM(supabase, it.recipient.personId, senderDisplay, category, message, "biscoito_submit");
          } else if (it.recipient.slackUserId) {
            try {
              const openRes = await fetch("https://slack.com/api/conversations.open", {
                method: "POST",
                headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
                body: JSON.stringify({ users: it.recipient.slackUserId }),
              });
              const open = await openRes.json();
              if (open.ok && open.channel?.id) {
                const txt =
                  `🍪 *Você ganhou um biscoito!*\n${catLabel}\nDe: *${senderDisplay}*\n> ${message}\n\n` +
                  `_Seu cadastro no app ainda está pendente. Assim que for aprovado, os pontos entram no painel de Engajamento._`;
                await fetch("https://slack.com/api/chat.postMessage", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ channel: open.channel.id, text: txt }),
                });
              }
            } catch (e: any) {
              console.error("[biscoito_submit] slack-only recipient DM error:", e?.message || e);
            }
          }
        }

        const notifyKudoIds = inserted.filter((it) => it.recipient.personId).map((it) => it.kudo.id);
        if (notifyKudoIds.length > 0) {
          const payload = notifyKudoIds.length === 1
            ? { kudo_id: notifyKudoIds[0] }
            : { kudo_ids: notifyKudoIds };
          try {
            await supabase.functions.invoke("kudos-notify-managers", { body: payload });
          } catch (e: any) {
            console.error("[biscoito_submit] notify invoke failed", e?.message);
          }
        }
      };
      // @ts-ignore EdgeRuntime disponível no Supabase
      EdgeRuntime.waitUntil(postBiscoitoSideEffects());

      console.log(`[biscoito_submit] inserted ${inserted.length} kudo(s) from=${senderPersonId ?? `slack:${slackUserId}`}`);
      return new Response(JSON.stringify({ response_action: "clear" }), {
        headers: { "Content-Type": "application/json" },
      });
    }



    // (awardPoints / completePeerPair are defined at module scope above)







    // view_submission for open-text pulse question
    if (payload.type === "view_submission" && payload.view?.callback_id?.startsWith("pulse_text:")) {
      const parts = payload.view.callback_id.split(":");
      const [, runId, questionId] = parts;
      const pairId = parts[3] || undefined;
      const text = payload.view.state.values?.pulse_text_block?.pulse_text_input?.value || "";
      const slackUserId = payload.user.id;
      console.log(`[pulse view_submission] run=${runId} q=${questionId} pair=${pairId ?? "-"} slack_user=${slackUserId}`);
      const respondent = await resolveRespondent(slackUserId, supabase);
      console.log(`[pulse view_submission] respondent=${respondent?.id ?? "NOT_FOUND"}`);
      if (respondent) {
        // Resolve subject_id if we have a pair, so we can persist a per-pair response
        let subjectId: string | null = null;
        if (pairId) {
          const { data: pair } = await supabase
            .from("peer_review_pairs")
            .select("subject_id")
            .eq("id", pairId)
            .maybeSingle();
          subjectId = pair?.subject_id ?? null;
        }

        const { data: upRow, error: upErr } = await supabase.from("pulse_responses").upsert(
          { run_id: runId, question_id: questionId, respondent_id: respondent.id, text_value: text, subject_id: subjectId },
          { onConflict: "run_id,question_id,respondent_id,subject_id" }
        ).select("id").single();
        if (upErr) console.error("[pulse view_submission] upsert error:", upErr);
        else {
          await bumpResponseCount(runId, supabase);
          await awardPoints(supabase, respondent.id, 5, "pulse_response", runId);
          await completePeerPair(supabase, runId, respondent.id, pairId);
          await markRecipientResponded(supabase, runId, respondent.id);
          if (upRow?.id) {
            supabase.functions.invoke("pulse-response-notify", { body: { response_id: upRow.id } })
              .catch((e: any) => console.error("[pulse_text] notify invoke failed", e?.message));
          }
        }
      }

      return new Response(JSON.stringify({ response_action: "clear" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // block_actions for pulse
    if (payload.type === "block_actions" && payload.actions?.[0]) {
      const act = payload.actions[0];
      console.log(`[block_actions] action_id=${act.action_id}`);
      if (act.action_id?.startsWith("pulse_answer:")) {
        const parts = act.action_id.split(":");
        const [, runId, questionId, value] = parts;
        const pairId = parts[4] || undefined;
        const slackUserId = payload.user.id;
        console.log(`[pulse_answer] run=${runId} q=${questionId} value=${value} pair=${pairId ?? "-"} slack_user=${slackUserId}`);
        const respondent = await resolveRespondent(slackUserId, supabase);
        console.log(`[pulse_answer] respondent=${respondent?.id ?? "NOT_FOUND"}`);
        if (respondent) {
          let subjectId: string | null = null;
          if (pairId) {
            const { data: pair } = await supabase
              .from("peer_review_pairs")
              .select("subject_id")
              .eq("id", pairId)
              .maybeSingle();
            subjectId = pair?.subject_id ?? null;
          }

          const { data: upRow, error: upErr } = await supabase.from("pulse_responses").upsert(
            { run_id: runId, question_id: questionId, respondent_id: respondent.id, scale_value: parseInt(value, 10), slack_message_ts: payload.message?.ts, subject_id: subjectId },
            { onConflict: "run_id,question_id,respondent_id,subject_id" }
          ).select("id").single();
          if (upErr) {
            console.error("[pulse_answer] upsert error:", upErr);
          } else {
            await bumpResponseCount(runId, supabase);
            await awardPoints(supabase, respondent.id, 5, "pulse_response", runId);
            await completePeerPair(supabase, runId, respondent.id, pairId);
            await markRecipientResponded(supabase, runId, respondent.id);
            await postEphemeralAck(payload, `✅ Resposta registrada: *${value}/5*`);
            if (upRow?.id) {
              supabase.functions.invoke("pulse-response-notify", { body: { response_id: upRow.id } })
                .catch((e: any) => console.error("[pulse_answer] notify invoke failed", e?.message));
            }
          }

        } else {
          await postEphemeralAck(payload, `⚠️ Não consegui identificar seu usuário no sistema (email do Slack não bate com nenhum colaborador).`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      if (act.action_id?.startsWith("pulse_text_open:")) {
        const parts = act.action_id.split(":");
        const [, runId, questionId] = parts;
        const pairId = parts[3] || "";
        const callbackId = pairId ? `pulse_text:${runId}:${questionId}:${pairId}` : `pulse_text:${runId}:${questionId}`;
        const r = await fetch("https://slack.com/api/views.open", {
          method: "POST",
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            trigger_id: payload.trigger_id,
            view: {
              type: "modal",
              callback_id: callbackId,
              title: { type: "plain_text", text: "Responder" },
              submit: { type: "plain_text", text: "Enviar" },
              close: { type: "plain_text", text: "Cancelar" },
              blocks: [
                {
                  type: "input",
                  block_id: "pulse_text_block",
                  label: { type: "plain_text", text: "Sua resposta" },
                  element: {
                    type: "plain_text_input",
                    action_id: "pulse_text_input",
                    multiline: true,
                  },
                },
              ],
            },
          }),
        });
        const d = await r.json();
        if (!d.ok) console.error("[pulse_text_open] views.open error:", d);
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
      if (act.action_id?.startsWith("give_kudos_open:")) {
        const [, surveyId] = act.action_id.split(":");
        const { data: survey } = await supabase
          .from("pulse_surveys")
          .select("title, kudos_categories, kudos_channel")
          .eq("id", surveyId)
          .maybeSingle();

        const ALL_CATS = [
          { value: "teamwork", label: "🤝 Trabalho em equipe" },
          { value: "innovation", label: "💡 Inovação" },
          { value: "delivery", label: "🚀 Entrega" },
          { value: "leadership", label: "🏆 Liderança" },
          { value: "customer", label: "❤️ Foco no cliente" },
        ];
        const allowedCats = (survey?.kudos_categories && survey.kudos_categories.length)
          ? ALL_CATS.filter((c) => survey.kudos_categories.includes(c.value))
          : ALL_CATS;

        const slackUserId = payload.user.id;
        const originChannelId = payload.channel?.id || null;

        // Lista todos os membros do Slack — mesma regra do /biscoito
        const slackMembers = await listAllSlackMembers();

        const { data: peopleRows } = await supabase
          .from("people")
          .select("id, nome, email")
          .eq("ativo", true);

        const emailToPerson = new Map<string, { id: string; nome: string }>();
        const nameToPerson = new Map<string, { id: string; nome: string }>();
        for (const p of (peopleRows || []) as Array<{ id: string; nome: string; email: string | null }>) {
          const e = normEmail(p.email);
          if (e) emailToPerson.set(e, { id: p.id, nome: p.nome });
          const n = normName(p.nome);
          if (n && !nameToPerson.has(n)) nameToPerson.set(n, { id: p.id, nome: p.nome });
        }

        // Sender info para filtrar do select
        let senderEmail = "";
        let senderName = "";
        try {
          const r = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(slackUserId)}`, {
            headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
          });
          const d = await r.json();
          if (d.ok) {
            senderEmail = normEmail(d.user?.profile?.email);
            senderName = normName(pickDisplayName(d.user || {}));
          }
        } catch (e) {
          console.warn("[give_kudos_open] users.info sender failed:", e);
        }

        const memberNameCandidates = (m: SlackMember): string[] => {
          const list = [m.profile?.display_name, m.profile?.real_name, m.real_name, m.name];
          const out: string[] = [];
          for (const v of list) {
            const n = normName(v);
            if (n && !out.includes(n)) out.push(n);
          }
          return out;
        };

        type Opt = { text: string; value: string; sortKey: string };
        const opts: Opt[] = [];
        const seenPersonIds = new Set<string>();
        const seenSlackIds = new Set<string>();

        for (const m of slackMembers) {
          if (m.id === slackUserId) continue;
          const email = normEmail(m.profile?.email);
          const names = memberNameCandidates(m);
          if (senderEmail && email && email === senderEmail) continue;
          if (senderName && names.includes(senderName)) continue;

          let person = email ? emailToPerson.get(email) : undefined;
          if (!person) {
            for (const n of names) {
              const hit = nameToPerson.get(n);
              if (hit) { person = hit; break; }
            }
          }

          if (person) {
            if (seenPersonIds.has(person.id)) continue;
            seenPersonIds.add(person.id);
            opts.push({ text: person.nome, value: `app:${person.id}`, sortKey: person.nome.toLowerCase() });
          } else {
            if (seenSlackIds.has(m.id)) continue;
            seenSlackIds.add(m.id);
            const name = pickDisplayName(m);
            opts.push({ text: name, value: `slack:${m.id}`, sortKey: name.toLowerCase() });
          }
        }
        opts.sort((a, b) => a.sortKey.localeCompare(b.sortKey, "pt"));

        if (opts.length === 0) {
          // Fallback ao DM-ack: avisa ephemeral se possível
          console.warn("[give_kudos_open] sem opções de destinatários");
        }

        const limited = opts.slice(0, 100);
        const peopleOpts = limited.map((o) => ({
          text: { type: "plain_text", text: o.text.slice(0, 75) },
          value: o.value,
        }));

        const kudosChannel = survey?.kudos_channel?.trim() || null;
        const privateMetadata = JSON.stringify({
          kudos_channel: kudosChannel,
          origin_channel_id: originChannelId,
        });

        const blocks: any[] = [
          {
            type: "input",
            block_id: "kudo_to_block",
            label: { type: "plain_text", text: "Para quem?" },
            element: {
              type: "static_select",
              action_id: "kudo_to_select",
              placeholder: { type: "plain_text", text: "Escolha um colega do Slack" },
              options: peopleOpts,
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
                text: { type: "plain_text", text: allowedCats[0].label },
                value: allowedCats[0].value,
              },
              options: allowedCats.map((c) => ({
                text: { type: "plain_text", text: c.label },
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
              placeholder: { type: "plain_text", text: "Diga por que esse colega merece um kudos 🎉" },
            },
          },
        ];

        if (kudosChannel) {
          blocks.push({
            type: "input",
            block_id: "kudo_share_block",
            optional: true,
            label: { type: "plain_text", text: "Compartilhar" },
            element: {
              type: "checkboxes",
              action_id: "kudo_share_check",
              options: [{
                text: { type: "plain_text", text: `Postar em ${kudosChannel}` },
                value: "share",
              }],
            },
          });
        }

        blocks.push({
          type: "context",
          elements: [
            { type: "mrkdwn", text: "Alguns colegas podem ainda não ter conta no app. O kudos será registrado e pontuado assim que o cadastro for aprovado." },
          ],
        });

        const r = await fetch("https://slack.com/api/views.open", {
          method: "POST",
          headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            trigger_id: payload.trigger_id,
            view: {
              type: "modal",
              callback_id: `kudos_submit:${surveyId}`,
              private_metadata: privateMetadata,
              title: { type: "plain_text", text: "🎉 Dar kudos" },
              submit: { type: "plain_text", text: "Enviar" },
              close: { type: "plain_text", text: "Cancelar" },
              blocks,
            },
          }),
        });
        const d = await r.json();
        if (!d.ok) console.error("[give_kudos_open] views.open error:", d);
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }



      // Unknown pulse-like or other block_action — don't fall into legacy approval handler
      if (!act.value) {
        console.log(`[block_actions] no value, ignoring action_id=${act.action_id}`);
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
      }
    }

    // ============ APPROVAL FLOW (legado) ============
    if (payload.type !== "block_actions" || !payload.actions?.[0]?.value) {
      console.log("[slack-interactions] no matching handler for payload type:", payload.type);
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    const action = payload.actions[0];
    const requestId = action.value;
    const actionId = action.action_id;


    // Get request details
    const { data: request, error: requestError } = await supabase
      .from('requests')
      .select(`
        *,
        requester:people!requester_id(id, nome, email, gestor_id)
      `)
      .eq('id', requestId)
      .single();

    if (requestError || !request) {
      throw new Error("Request not found");
    }

    // Get approver from Slack user
    const slackUserId = payload.user.id;
    const userResponse = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
      headers: { "Authorization": `Bearer ${SLACK_BOT_TOKEN}` },
    });
    const userData = await userResponse.json();
    const approverEmail = userData.user.profile.email;

    const { data: approver } = await supabase
      .from('people')
      .select('id, nome')
      .eq('email', approverEmail)
      .single();

    if (!approver) {
      throw new Error("Approver not found");
    }

    let newStatus = request.status;
    let level = '';

    if (actionId === 'approve_request') {
      // Determine approval level
      if (request.status === 'AGUARDANDO_GESTOR' || request.status === 'PENDENTE') {
        newStatus = 'AGUARDANDO_DIRETOR';
        level = 'GESTOR';
      } else if (request.status === 'AGUARDANDO_DIRETOR') {
        newStatus = 'APROVADO_FINAL';
        level = 'DIRETOR';
      }

      // Update request status
      await supabase
        .from('requests')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      // Create approval record
      await supabase.from('approvals').insert({
        request_id: requestId,
        approver_id: approver.id,
        level,
        acao: 'APROVADO',
        comentario: 'Aprovado via Slack',
      });

      // Update Slack message
      await fetch("https://slack.com/api/chat.update", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: payload.channel.id,
          ts: payload.message.ts,
          text: `✅ Solicitação aprovada por ${approver.nome}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*✅ Solicitação Aprovada*\n👤 ${request.requester.nome}\n📅 ${request.inicio} até ${request.fim}\n✓ Aprovado por ${approver.nome}`,
              },
            },
          ],
        }),
      });

      // Send email to requester
      await supabase.functions.invoke('send-notification-email', {
        body: {
          to: request.requester.email,
          subject: `Solicitação Aprovada`,
          text: `Sua solicitação de ${request.tipo} foi aprovada por ${approver.nome}.`,
        },
      });

    } else if (actionId === 'reject_request') {
      newStatus = 'REJEITADO';
      level = request.status === 'AGUARDANDO_DIRETOR' ? 'DIRETOR' : 'GESTOR';

      await supabase
        .from('requests')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      await supabase.from('approvals').insert({
        request_id: requestId,
        approver_id: approver.id,
        level,
        acao: 'REJEITADO',
        comentario: 'Rejeitado via Slack',
      });

      await fetch("https://slack.com/api/chat.update", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: payload.channel.id,
          ts: payload.message.ts,
          text: `❌ Solicitação rejeitada por ${approver.nome}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*❌ Solicitação Rejeitada*\n👤 ${request.requester.nome}\n📅 ${request.inicio} até ${request.fim}\n✗ Rejeitado por ${approver.nome}`,
              },
            },
          ],
        }),
      });

      await supabase.functions.invoke('send-notification-email', {
        body: {
          to: request.requester.email,
          subject: `Solicitação Rejeitada`,
          text: `Sua solicitação de ${request.tipo} foi rejeitada por ${approver.nome}.`,
        },
      });

    } else if (actionId === 'request_info') {
      newStatus = 'INFORMACOES_ADICIONAIS';

      await supabase
        .from('requests')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      await fetch("https://slack.com/api/chat.update", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: payload.channel.id,
          ts: payload.message.ts,
          text: `📋 Informações adicionais solicitadas por ${approver.nome}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*📋 Informações Adicionais Solicitadas*\n👤 ${request.requester.nome}\n📅 ${request.inicio} até ${request.fim}\n📝 Solicitado por ${approver.nome}`,
              },
            },
          ],
        }),
      });

      await supabase.functions.invoke('send-notification-email', {
        body: {
          to: request.requester.email,
          subject: `Informações Adicionais Necessárias`,
          text: `${approver.nome} solicitou informações adicionais sobre sua solicitação de ${request.tipo}.`,
        },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in slack-interactions:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
