/** Resolve both identifiers atomically; never fall back after a database failure. */
export async function resolveExpectedRunAndQuestion(
  supabase: any, runId: string, questionId: string, now = new Date(),
): Promise<{ runId: string; questionId: string }> {
  const { data, error } = await supabase.rpc("resolve_pulse_response_target", {
    p_run_id: runId, p_question_id: questionId, p_event_at: now.toISOString(),
  });
  if (error || !data?.runId || !data?.questionId) throw error ?? new Error("Destino da resposta indisponível");
  return data;
}

/** Slack's signed event time controls latest-wins, not network arrival order. */
export function pulseEvent(payload: any, signedTimestamp: string, signature: string) {
  const eventAt = String(payload.actions?.[0]?.action_ts || signedTimestamp);
  if (!/^\d+(\.\d+)?$/.test(eventAt)) throw new Error("Invalid Slack event timestamp");
  return { p_event_at: eventAt, p_event_id: signature };
}

export async function submitPulseResponse(supabase: any, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("submit_pulse_response", args);
  if (error || !data?.id || !data?.runId) throw error ?? new Error("Resposta não foi salva");
  return data as { id: string; runId: string; action: "inserted" | "updated" | "repeated"; notify: boolean };
}
