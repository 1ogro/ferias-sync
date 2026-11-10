// Regras de abono pecuniário e adiantamento da 1ª parcela do 13º (exclusivas para CLT).
// Espelham o gatilho enforce_clt_vacation_benefits no banco.
export const CLT_MODELS = ["CLT", "CLT_ABONO_LIVRE", "CLT_ABONO_FIXO"];

export const isCltModel = (m?: string | null) => !!m && CLT_MODELS.includes(m);

export function abonoOptions(model?: string | null): { max: number; fixed: number[] } {
  if (!isCltModel(model)) return { max: 0, fixed: [] };
  if (model === "CLT_ABONO_FIXO") return { max: 10, fixed: [0, 10] };
  return { max: 10, fixed: [] };
}

/** 13º só pode acompanhar férias iniciadas entre fevereiro e novembro. */
export function decimoMonthAllowed(inicio?: string | null): boolean {
  if (!inicio) return false;
  const month = Number(inicio.slice(5, 7));
  return month >= 2 && month <= 11;
}

export function cltBenefitsError(p: {
  model?: string | null; diasAbono: number; solicita13: boolean;
  inicio?: string; fim?: string; decimoUsedThisYear: boolean;
}): string | null {
  const { model, diasAbono, solicita13 } = p;
  if (!isCltModel(model)) {
    return diasAbono > 0 || solicita13 ? "Abono e 13º são exclusivos para colaboradores CLT." : null;
  }
  const { max, fixed } = abonoOptions(model);
  if (diasAbono < 0 || diasAbono > max) return `O abono deve ser entre 0 e ${max} dias.`;
  if (fixed.length && !fixed.includes(diasAbono)) return `Para seu contrato, o abono deve ser de ${fixed.join(" ou ")} dias.`;
  if (diasAbono > 0 && p.inicio && p.fim) {
    const days = Math.round((Date.parse(p.fim) - Date.parse(p.inicio)) / 86400000) + 1;
    if (diasAbono > days) return "O abono não pode ser maior que o período de férias.";
  }
  if (solicita13) {
    if (!decimoMonthAllowed(p.inicio)) return "O adiantamento do 13º só vale para férias que começam entre fevereiro e novembro.";
    if (p.decimoUsedThisYear) return "Você já solicitou o adiantamento da 1ª parcela do 13º neste ano.";
  }
  return null;
}
