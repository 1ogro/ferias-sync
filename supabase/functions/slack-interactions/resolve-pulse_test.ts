import { resolveExpectedRunAndQuestion } from "./resolve-pulse.ts";

const source = { survey_id: "in", position: 0, question_type: "scale_1_5", question_text: "Sentimento?", required: true };
const friday = new Date("2026-09-04T15:00:00Z");
function mock(results: unknown[]) {
  let index = 0;
  const client = { from: () => {
    const query: any = {};
    for (const method of ["select", "eq", "insert"]) query[method] = (value: unknown) => {
      if (method === "select" && String(value).split(/,\s*/).includes("kind")) throw new Error("Invalid kind column");
      if (method === "insert" && value && typeof value === "object" && "kind" in value) throw new Error("Invalid kind column");
      return query;
    };
    query.maybeSingle = query.single = () => Promise.resolve(results[index++]);
    return query;
  }};
  return client;
}
const run = { data: { survey_id: "in", survey: { title: "Check-in semanal de bem-estar" } } };
const destination = { data: { id: "out" } };
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(JSON.stringify({ actual, expected }));
}
Deno.test("successful reroute maps both identifiers", async () => {
  equal(await resolveExpectedRunAndQuestion(mock([run, destination, { data: source }, { data: { id: "q-out" } }, { data: { id: "r-out" } }]), "r-in", "q-in", friday), { runId: "r-out", questionId: "q-out" });
});
for (const [name, steps] of Object.entries({
  "missing source": [{ data: null }],
  "wrong source survey": [{ data: { ...source, survey_id: "wrong" } }],
  "ambiguous target": [{ data: source }, { error: "multiple questions" }],
  "question creation failure": [{ data: source }, { data: null }, { error: "insert failed" }],
  "run creation failure": [{ data: source }, { data: { id: "q-out" } }, { data: null }, { error: "insert failed" }],
  "empty creation result": [{ data: source }, { data: null }, { data: null }],
})) {
  Deno.test(`${name} preserves original pair`, async () => {
    equal(await resolveExpectedRunAndQuestion(mock([run, destination, ...steps]), "r-in", "q-in", friday), { runId: "r-in", questionId: "q-in" });
  });
}
Deno.test("same classification leaves original pair unchanged", async () => {
  equal(await resolveExpectedRunAndQuestion(mock([run]), "r-in", "q-in", new Date("2026-09-03T15:00:00Z")), { runId: "r-in", questionId: "q-in" });
});