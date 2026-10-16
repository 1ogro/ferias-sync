import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { evaluationLevel, passesContractFilter } from "./evaluation.ts";

Deno.test("nível do critério segue o papel", () => {
  assertEquals(evaluationLevel("DIRETOR"), "diretor");
  assertEquals(evaluationLevel("GESTOR"), "gestor");
  assertEquals(evaluationLevel("GERENTE"), "gestor");
  assertEquals(evaluationLevel("COLABORADOR"), "colaborador");
});

Deno.test("ciclo apenas CLT exclui PJ do quadro operacional", () => {
  assertEquals(passesContractFilter({ papel: "COLABORADOR", modelo_contrato: "PJ" }, "clt"), false);
  assertEquals(passesContractFilter({ papel: "COLABORADOR", modelo_contrato: "CLT_ABONO_FIXO" }, "clt"), true);
});

Deno.test("ciclo apenas PJ exclui CLT do quadro operacional", () => {
  assertEquals(passesContractFilter({ papel: "COLABORADOR", modelo_contrato: "CLT" }, "pj"), false);
  assertEquals(passesContractFilter({ papel: "COLABORADOR", modelo_contrato: "PJ" }, "pj"), true);
});

Deno.test("filtro de contrato não vale para liderança", () => {
  assertEquals(passesContractFilter({ papel: "GESTOR", modelo_contrato: "CLT" }, "pj"), true);
  assertEquals(passesContractFilter({ papel: "DIRETOR", modelo_contrato: "PJ" }, "clt"), true);
});
