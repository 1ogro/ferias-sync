// Regras puras das avaliações 90/180/270 (testáveis sem Slack).
export function evaluationLevel(papel?: string | null): "colaborador" | "gestor" | "diretor" {
  if (papel === "DIRETOR") return "diretor";
  if (papel === "GESTOR" || papel === "GERENTE") return "gestor";
  return "colaborador";
}

/** Contract filter applies only to the operational staff (colaborador level). */
export function passesContractFilter(p: { papel?: string | null; modelo_contrato?: string | null }, filter: string): boolean {
  if (!filter || filter === "all") return true;
  if (evaluationLevel(p.papel) !== "colaborador") return true;
  const isPJ = (p.modelo_contrato || "CLT") === "PJ";
  return filter === "pj" ? isPJ : !isPJ;
}

