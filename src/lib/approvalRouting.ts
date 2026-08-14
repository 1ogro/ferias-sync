import { supabase } from "@/integrations/supabase/client";

export interface FinalApprover {
  id: string;
  nome: string;
  email: string | null;
  sub_time: string | null;
}

/**
 * Resolves the final approver (GERENTE) for a person's team.
 *
 * Rule: a GERENTE that belongs to a team (`sub_time`) is the last approval
 * instance for every collaborator and gestor of that team. The GERENTE's own
 * requests escalate to the diretoria instead (returns null).
 */
export async function resolveFinalApprover(
  requesterPersonId: string
): Promise<FinalApprover | null> {
  if (!requesterPersonId) return null;

  const { data: requester, error: reqErr } = await supabase
    .from("people")
    .select("id, sub_time")
    .eq("id", requesterPersonId)
    .maybeSingle();

  if (reqErr || !requester?.sub_time) return null;

  const { data: gerentes, error } = await supabase
    .from("people")
    .select("id, nome, email, sub_time")
    .eq("papel", "GERENTE")
    .eq("ativo", true)
    .eq("sub_time", requester.sub_time);

  if (error || !gerentes?.length) return null;

  const candidate = gerentes.find((g) => g.id !== requesterPersonId);
  return candidate ?? null;
}

/** True when `personId` is the final approver (team GERENTE) for the requester. */
export function isFinalApproverOf(
  approver: { id: string; papel?: string | null; subTime?: string | null; sub_time?: string | null } | null | undefined,
  requester: { id: string; sub_time?: string | null; subTime?: string | null } | null | undefined
): boolean {
  if (!approver || !requester) return false;
  if (approver.papel !== "GERENTE") return false;
  const approverTeam = approver.subTime ?? approver.sub_time ?? null;
  const requesterTeam = requester.sub_time ?? requester.subTime ?? null;
  if (!approverTeam || !requesterTeam) return false;
  return approverTeam === requesterTeam && approver.id !== requester.id;
}
