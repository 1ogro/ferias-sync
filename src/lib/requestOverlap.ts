import { supabase } from "@/integrations/supabase/client";

/**
 * Statuses that still "hold" a period for a requester: either awaiting a
 * decision or already granted. A new request overlapping any of these is
 * almost always an accidental duplicate.
 */
export const BLOCKING_STATUSES = [
  "PENDENTE",
  "EM_ANALISE_GESTOR",
  "APROVADO_1NIVEL",
  "EM_ANALISE_DIRETOR",
  "INFORMACOES_ADICIONAIS",
  "APROVADO_FINAL",
  "REALIZADO",
] as const;


/** Statuses that are still open (awaiting someone's action). */
export const OPEN_STATUSES = [
  "PENDENTE",
  "EM_ANALISE_GESTOR",
  "APROVADO_1NIVEL",
  "EM_ANALISE_DIRETOR",
  "INFORMACOES_ADICIONAIS",
] as const;

export interface OverlappingRequest {
  id: string;
  tipo: string;
  inicio: string | null;
  fim: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/** True when two closed date intervals (YYYY-MM-DD) intersect. */
export function periodsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Finds the requester's own requests whose period overlaps [inicio, fim].
 * Used to warn before creating/editing a duplicated request.
 */
export async function findOverlappingOwnRequests(
  personId: string,
  inicio: string,
  fim: string,
  excludeRequestId?: string,
): Promise<OverlappingRequest[]> {
  if (!personId || !inicio || !fim) return [];

  const { data, error } = await supabase
    .from("requests")
    .select("id, tipo, inicio, fim, status, created_at, updated_at")
    .eq("requester_id", personId)
    .in("status", BLOCKING_STATUSES as unknown as string[])
    .lte("inicio", fim)
    .gte("fim", inicio);

  if (error) {
    console.error("[findOverlappingOwnRequests]", error);
    return [];
  }

  return (data || []).filter((r) => r.id !== excludeRequestId) as OverlappingRequest[];
}

/**
 * Cancels previous requests that the new one replaces, keeping an audit trail.
 */
export async function supersedeRequests(
  requestIds: string[],
  actorPersonId: string,
  replacementRequestId?: string,
): Promise<void> {
  if (!requestIds.length) return;

  const { error } = await supabase
    .from("requests")
    .update({ status: "CANCELADO", updated_at: new Date().toISOString() })
    .in("id", requestIds);

  if (error) {
    console.error("[supersedeRequests] update failed", error);
    return;
  }

  await supabase.from("approvals").insert(
    requestIds.map((id) => ({
      request_id: id,
      level: "SOLICITANTE",
      approver_id: actorPersonId,
      acao: "CANCELAR",
      comentario: "Cancelada automaticamente por ter sido substituída por uma nova solicitação do mesmo período.",
    })),
  );

  await supabase.from("audit_logs").insert(
    requestIds.map((id) => ({
      entidade: "requests",
      entidade_id: id,
      acao: "SUPERSEDED",
      actor_id: actorPersonId,
      payload: { replacement_request_id: replacementRequestId ?? null },
    })),
  );
}

/** Days a request has been sitting untouched, based on updated_at. */
export function daysSince(dateValue: string | Date): number {
  const d = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
