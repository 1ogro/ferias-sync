import { pulseEvent, resolveExpectedRunAndQuestion, submitPulseResponse } from "./resolve-pulse.ts";
function equal(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify({ a, b })); }
Deno.test("resolution delegates canonical mapping atomically", async () => {
  const client = { rpc(name: string, args: any) {
    equal(name, "resolve_pulse_response_target"); equal(args.p_run_id, "original");
    return { data: { runId: "canonical", questionId: "mapped" } };
  } };
  equal(await resolveExpectedRunAndQuestion(client, "original", "question"), { runId: "canonical", questionId: "mapped" });
});
for (const result of [{ error: new Error("failed") }, { data: null }, { data: { runId: "partial" } }]) {
  Deno.test(`resolution fails closed: ${JSON.stringify(result)}`, async () => {
    let rejected = false;
    try { await resolveExpectedRunAndQuestion({ rpc: () => result }, "r", "q"); } catch { rejected = true; }
    equal(rejected, true);
  });
}
Deno.test("Slack click retains precise original timestamp", () => {
  equal(pulseEvent({ actions: [{ action_ts: "1788958801.123456" }] }, "1788958802", "v0=sig"), { p_event_at: "1788958801.123456", p_event_id: "v0=sig" });
});
Deno.test("modal uses signed timestamp and signature for deduplication", () => {
  equal(pulseEvent({}, "1788958802", "v0=modal"), { p_event_at: "1788958802", p_event_id: "v0=modal" });
});
for (const action of ["inserted", "updated", "repeated"]) {
  Deno.test(`persistence preserves ${action} outcome`, async () => {
    const result = { id: "response", runId: "canonical", action, notify: action === "inserted" };
    equal(await submitPulseResponse({ rpc: (name: string, args: any) => {
      equal(name, "submit_pulse_response"); equal(args.p_subject_id, "peer"); return { data: result };
    } }, { p_subject_id: "peer" }), result);
  });
}
Deno.test("persistence never confirms failed save", async () => {
  let rejected = false;
  try { await submitPulseResponse({ rpc: () => ({ error: new Error("database down") }) }, {}); } catch { rejected = true; }
  equal(rejected, true);
});
