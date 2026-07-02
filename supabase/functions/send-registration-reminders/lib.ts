// Pure helpers extracted for unit testing.

export type Mode = "weekly" | "month_end";

export interface PendingRow {
  id: string;
  nome: string;
  email: string | null;
  data_contrato: string | null;
  modelo_contrato: string | null;
  dia_pagamento: number | null;
  gestor_id: string | null;
  created_at: string;
  source?: string;
}

export interface PersonRow {
  id: string;
  nome: string;
  email: string | null;
  slack_user_id: string | null;
  data_contrato: string | null;
  modelo_contrato: string | null;
  dia_pagamento: number | null;
  data_nascimento: string | null;
  profile_completed_at: string | null;
  gestor_id: string | null;
  ativo: boolean | null;
}

/** True when `today` is within 3 calendar days of the next month starting. */
export function isNearMonthEnd(today: Date = new Date()): boolean {
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const diff = Math.round((next.getTime() - today.getTime()) / 86400000);
  return diff <= 3;
}

/** Dedup window in hours for the given mode. month_end never dedupes. */
export function dedupWindowHours(mode: Mode): number {
  return mode === "weekly" ? 6 * 24 : 0;
}

/** Returns critical missing fields for a pending_people row. */
export function pendingMissingFields(row: PendingRow): string[] {
  const miss: string[] = [];
  if (!row.email) miss.push("🔴 email corporativo (bloqueia login)");
  if (!row.data_contrato) miss.push("🟠 data de contrato");
  if (!row.modelo_contrato) miss.push("🟠 modelo de contrato");
  if (row.modelo_contrato === "PJ" && !row.dia_pagamento) miss.push("🟡 dia de pagamento (PJ)");
  return miss;
}

/** Returns missing critical fields for an active person profile. */
export function peopleIncompleteReasons(p: PersonRow): string[] {
  const miss: string[] = [];
  if (!p.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
    miss.push("🔴 email corporativo válido (necessário para login)");
  }
  if (!p.slack_user_id) miss.push("🔴 vincular usuário do Slack (necessário para notificações)");
  if (!p.data_contrato) miss.push("🟠 data de contrato");
  if (!p.modelo_contrato) miss.push("🟠 modelo de contrato");
  if (p.modelo_contrato === "PJ" && !p.dia_pagamento) miss.push("🟠 dia de pagamento (PJ)");
  if (!p.data_nascimento) miss.push("🟡 data de nascimento");
  if (!p.profile_completed_at) miss.push("🟠 completar perfil no sistema");
  return miss;
}

/** Filter pending_people rows according to the mode: weekly requires >2 days old. */
export function selectPendings(
  rows: PendingRow[],
  mode: Mode,
  now: Date = new Date(),
): PendingRow[] {
  if (mode === "month_end") return rows;
  const cutoff = now.getTime() - 2 * 86400_000;
  return rows.filter((r) => new Date(r.created_at).getTime() <= cutoff);
}

/** Given already-reminded target ids and the mode, filter recipients that should still be notified. */
export function applyDedup<T extends { id: string }>(
  recipients: T[],
  recentTargets: Set<string>,
  mode: Mode,
): { keep: T[]; skipped: T[] } {
  if (mode === "month_end") return { keep: recipients, skipped: [] };
  const keep: T[] = [];
  const skipped: T[] = [];
  for (const r of recipients) {
    if (recentTargets.has(r.id)) skipped.push(r);
    else keep.push(r);
  }
  return { keep, skipped };
}

/** Group pending rows by manager id (or "__admins__" fallback). */
export function groupPendingByManager(rows: PendingRow[]): Map<string, PendingRow[]> {
  const m = new Map<string, PendingRow[]>();
  for (const r of rows) {
    const key = r.gestor_id || "__admins__";
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(r);
  }
  return m;
}

// ─────────────────────────────────────────────────────────────
// Slack message payload builders (pure)
// ─────────────────────────────────────────────────────────────

export interface SlackBlock {
  type: string;
  // deno-lint-ignore no-explicit-any
  [k: string]: any;
}

export interface SlackMessagePayload {
  text: string; // fallback / notification text
  blocks: SlackBlock[];
}

const trimSlash = (u: string) => u.replace(/\/+$/, "");

function urgencyPrefix(mode: Mode): string {
  return mode === "month_end" ? "🗓️ *Fim de mês* — " : "";
}

/**
 * DM to a manager/admin listing pending_people awaiting approval.
 * Always includes a CTA button linking to /admin (pending approvals list).
 */
export function buildPendingApprovalMessage(
  items: PendingRow[],
  opts: { mode: Mode; appBaseUrl: string; now?: Date; maxItems?: number },
): SlackMessagePayload {
  const now = opts.now ?? new Date();
  const base = trimSlash(opts.appBaseUrl);
  const url = `${base}/admin`;
  const max = opts.maxItems ?? 20;
  const shown = items.slice(0, max);

  const lines = shown.map((p) => {
    const days = Math.floor((now.getTime() - new Date(p.created_at).getTime()) / 86400_000);
    const miss = pendingMissingFields(p);
    return `• *${p.nome}* — pendente há *${days}d* (${p.source ?? "—"})${
      miss.length ? `\n   Faltando: ${miss.join(", ")}` : ""
    }`;
  }).join("\n");

  const header = `${urgencyPrefix(opts.mode)}Você tem *${items.length}* cadastro(s) pendente(s) de aprovação:`;
  const text = `${header}\n${lines}\n\nRevise em: ${url}`;

  const blocks: SlackBlock[] = [
    { type: "section", text: { type: "mrkdwn", text: header } },
    { type: "section", text: { type: "mrkdwn", text: lines || "_sem itens_" } },
    {
      type: "actions",
      block_id: "pending_approval_actions",
      elements: [
        {
          type: "button",
          action_id: "open_pending_approvals",
          style: "primary",
          text: { type: "plain_text", text: "Abrir aprovações" },
          url,
        },
      ],
    },
  ];

  if (items.length > shown.length) {
    blocks.splice(2, 0, {
      type: "context",
      elements: [{ type: "mrkdwn", text: `_+${items.length - shown.length} outros omitidos_` }],
    });
  }

  return { text, blocks };
}

/**
 * DM to the person themselves listing their incomplete profile items.
 * Includes a CTA to Settings → Profile.
 */
export function buildIncompleteProfileSelfMessage(
  person: Pick<PersonRow, "nome">,
  reasons: string[],
  opts: { mode: Mode; appBaseUrl: string },
): SlackMessagePayload {
  const url = `${trimSlash(opts.appBaseUrl)}/settings?tab=profile`;
  const header = `${urgencyPrefix(opts.mode)}Olá *${person.nome}*, seu cadastro ainda está incompleto.`;
  const body = reasons.map((r) => `• ${r}`).join("\n");
  const text = `${header}\nItens pendentes:\n${body}\n\nComplete em: ${url}`;

  const blocks: SlackBlock[] = [
    { type: "section", text: { type: "mrkdwn", text: header } },
    { type: "section", text: { type: "mrkdwn", text: `*Itens pendentes:*\n${body}` } },
    {
      type: "actions",
      block_id: "incomplete_profile_self_actions",
      elements: [
        {
          type: "button",
          action_id: "open_profile_settings",
          style: "primary",
          text: { type: "plain_text", text: "Completar perfil" },
          url,
        },
      ],
    },
  ];

  return { text, blocks };
}

/**
 * DM to a manager about a direct report with an incomplete profile.
 * Includes a CTA to the person's page in the team view.
 */
export function buildIncompleteProfileManagerMessage(
  person: Pick<PersonRow, "id" | "nome">,
  reasons: string[],
  opts: { mode: Mode; appBaseUrl: string },
): SlackMessagePayload {
  const url = `${trimSlash(opts.appBaseUrl)}/team/${person.id}`;
  const header = `${urgencyPrefix(opts.mode)}Seu liderado *${person.nome}* está com cadastro incompleto.`;
  const body = reasons.map((r) => `• ${r}`).join("\n");
  const text = `${header}\n${body}\n\nAcompanhe em: ${url}`;

  const blocks: SlackBlock[] = [
    { type: "section", text: { type: "mrkdwn", text: header } },
    { type: "section", text: { type: "mrkdwn", text: body || "_sem itens_" } },
    {
      type: "actions",
      block_id: "incomplete_profile_manager_actions",
      elements: [
        {
          type: "button",
          action_id: "open_team_member",
          text: { type: "plain_text", text: "Ver liderado" },
          url,
        },
      ],
    },
  ];

  return { text, blocks };
}
