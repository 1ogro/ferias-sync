import {
  assert,
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyDedup,
  buildIncompleteProfileManagerMessage,
  buildIncompleteProfileSelfMessage,
  buildPendingApprovalMessage,
  dedupWindowHours,
  groupPendingByManager,
  isNearMonthEnd,
  peopleIncompleteReasons,
  PendingRow,
  pendingMissingFields,
  PersonRow,
  selectPendings,
  SlackBlock,
} from "./lib.ts";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const daysAgoISO = (days: number, from = new Date()) =>
  new Date(from.getTime() - days * 86400_000).toISOString();

const pick = <T, K extends keyof T>(over: Partial<T>, key: K, fallback: T[K]): T[K] =>
  key in over ? (over[key] as T[K]) : fallback;

const pending = (over: Partial<PendingRow> = {}): PendingRow => ({
  id: pick(over, "id", crypto.randomUUID()),
  nome: pick(over, "nome", "Fulano"),
  email: pick(over, "email", "fulano@empresa.com"),
  data_contrato: pick(over, "data_contrato", "2024-01-01"),
  modelo_contrato: pick(over, "modelo_contrato", "CLT"),
  dia_pagamento: pick(over, "dia_pagamento", null),
  gestor_id: pick(over, "gestor_id", "mgr_1"),
  created_at: pick(over, "created_at", daysAgoISO(5)),
  source: pick(over, "source", "manual"),
});

const person = (over: Partial<PersonRow> = {}): PersonRow => ({
  id: pick(over, "id", crypto.randomUUID()),
  nome: pick(over, "nome", "Pessoa"),
  email: pick(over, "email", "pessoa@empresa.com"),
  slack_user_id: pick(over, "slack_user_id", "U123"),
  data_contrato: pick(over, "data_contrato", "2024-01-01"),
  modelo_contrato: pick(over, "modelo_contrato", "CLT"),
  dia_pagamento: pick(over, "dia_pagamento", null),
  data_nascimento: pick(over, "data_nascimento", "1990-01-01"),
  profile_completed_at: pick(over, "profile_completed_at", "2024-02-01T00:00:00Z"),
  gestor_id: pick(over, "gestor_id", "mgr_1"),
  ativo: pick(over, "ativo", true),
});

// ─────────────────────────────────────────────────────────────
// Pending selection
// ─────────────────────────────────────────────────────────────

Deno.test("selectPendings — weekly filters cadastros com menos de 2 dias", () => {
  const now = new Date("2026-07-15T12:00:00Z");
  const rows = [
    pending({ id: "old", created_at: daysAgoISO(5, now) }),
    pending({ id: "borderline", created_at: daysAgoISO(2, now) }),
    pending({ id: "fresh", created_at: daysAgoISO(1, now) }),
  ];
  const kept = selectPendings(rows, "weekly", now).map((r) => r.id).sort();
  assertEquals(kept, ["borderline", "old"]);
});

Deno.test("selectPendings — month_end mantém todos os pendentes, incluindo os recentes", () => {
  const now = new Date("2026-07-30T12:00:00Z");
  const rows = [
    pending({ id: "fresh", created_at: daysAgoISO(0.1, now) }),
    pending({ id: "old", created_at: daysAgoISO(10, now) }),
  ];
  const kept = selectPendings(rows, "month_end", now).map((r) => r.id).sort();
  assertEquals(kept, ["fresh", "old"]);
});

Deno.test("groupPendingByManager — agrupa por gestor e coloca sem gestor em __admins__", () => {
  const grouped = groupPendingByManager([
    pending({ id: "a", gestor_id: "mgr_1" }),
    pending({ id: "b", gestor_id: "mgr_1" }),
    pending({ id: "c", gestor_id: "mgr_2" }),
    pending({ id: "d", gestor_id: null }),
  ]);
  assertEquals(grouped.get("mgr_1")?.length, 2);
  assertEquals(grouped.get("mgr_2")?.length, 1);
  assertEquals(grouped.get("__admins__")?.length, 1);
});

Deno.test("pendingMissingFields — sinaliza campos críticos de contrato e auth", () => {
  assertEquals(pendingMissingFields(pending()).length, 0);

  const noEmail = pendingMissingFields(pending({ email: null }));
  assert(noEmail.some((s) => s.includes("email corporativo")));

  const pjSemPagamento = pendingMissingFields(
    pending({ modelo_contrato: "PJ", dia_pagamento: null }),
  );
  assert(pjSemPagamento.some((s) => s.includes("dia de pagamento")));

  const semContrato = pendingMissingFields(
    pending({ data_contrato: null, modelo_contrato: null }),
  );
  assert(semContrato.some((s) => s.includes("data de contrato")));
  assert(semContrato.some((s) => s.includes("modelo de contrato")));
});

// ─────────────────────────────────────────────────────────────
// Deduplicação semanal (6 dias)
// ─────────────────────────────────────────────────────────────

Deno.test("dedupWindowHours — semanal usa 6 dias (144h), month_end desliga", () => {
  assertStrictEquals(dedupWindowHours("weekly"), 144);
  assertStrictEquals(dedupWindowHours("month_end"), 0);
});

Deno.test("applyDedup — semanal pula destinatários notificados nos últimos 6 dias", () => {
  const recipients = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
  const already = new Set(["p1", "p3"]);
  const { keep, skipped } = applyDedup(recipients, already, "weekly");
  assertEquals(keep.map((r) => r.id), ["p2"]);
  assertEquals(skipped.map((r) => r.id), ["p1", "p3"]);
});

Deno.test("applyDedup — month_end ignora dedup e envia para todos", () => {
  const recipients = [{ id: "p1" }, { id: "p2" }];
  const already = new Set(["p1", "p2"]);
  const { keep, skipped } = applyDedup(recipients, already, "month_end");
  assertEquals(keep.length, 2);
  assertEquals(skipped.length, 0);
});

// ─────────────────────────────────────────────────────────────
// Varredura enfática nos últimos 3 dias do mês
// ─────────────────────────────────────────────────────────────

Deno.test("isNearMonthEnd — verdadeiro apenas nos últimos 3 dias corridos do mês", () => {
  // Janeiro tem 31 dias
  assertStrictEquals(isNearMonthEnd(new Date(2026, 0, 29, 12)), true);
  assertStrictEquals(isNearMonthEnd(new Date(2026, 0, 30, 12)), true);
  assertStrictEquals(isNearMonthEnd(new Date(2026, 0, 31, 12)), true);
  assertStrictEquals(isNearMonthEnd(new Date(2026, 0, 28, 12)), false);
  assertStrictEquals(isNearMonthEnd(new Date(2026, 0, 15, 12)), false);
});

Deno.test("isNearMonthEnd — cobre fevereiro (28/29 dias)", () => {
  // 2026 é não-bissexto: fevereiro tem 28 dias
  assertStrictEquals(isNearMonthEnd(new Date(2026, 1, 26, 12)), true);
  assertStrictEquals(isNearMonthEnd(new Date(2026, 1, 28, 12)), true);
  assertStrictEquals(isNearMonthEnd(new Date(2026, 1, 25, 12)), false);
  // 2028 é bissexto: fevereiro tem 29 dias
  assertStrictEquals(isNearMonthEnd(new Date(2028, 1, 27, 12)), true);
  assertStrictEquals(isNearMonthEnd(new Date(2028, 1, 29, 12)), true);
  assertStrictEquals(isNearMonthEnd(new Date(2028, 1, 26, 12)), false);
});

// ─────────────────────────────────────────────────────────────
// Cadastros incompletos (people)
// ─────────────────────────────────────────────────────────────

Deno.test("peopleIncompleteReasons — perfil completo não gera pendências", () => {
  assertEquals(peopleIncompleteReasons(person()).length, 0);
});

Deno.test("peopleIncompleteReasons — email inválido ou faltando bloqueia auth", () => {
  const semEmail = peopleIncompleteReasons(person({ email: null }));
  assert(semEmail.some((r) => r.includes("email corporativo")));

  const invalido = peopleIncompleteReasons(person({ email: "nao-e-email" }));
  assert(invalido.some((r) => r.includes("email corporativo")));
});

Deno.test("peopleIncompleteReasons — falta de Slack bloqueia notificações", () => {
  const semSlack = peopleIncompleteReasons(person({ slack_user_id: null }));
  assert(semSlack.some((r) => r.includes("Slack")));
});

Deno.test("peopleIncompleteReasons — PJ sem dia de pagamento é apontado", () => {
  const pj = peopleIncompleteReasons(
    person({ modelo_contrato: "PJ", dia_pagamento: null }),
  );
  assert(pj.some((r) => r.includes("dia de pagamento")));
});

Deno.test("peopleIncompleteReasons — perfil não finalizado é apontado", () => {
  const incompleto = peopleIncompleteReasons(
    person({ profile_completed_at: null }),
  );
  assert(incompleto.some((r) => r.includes("completar perfil")));
});
