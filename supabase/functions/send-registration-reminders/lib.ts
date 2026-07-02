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
