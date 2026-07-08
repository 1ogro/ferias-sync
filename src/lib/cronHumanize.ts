// Tradução simples de expressões cron (5 campos) para pt-BR, cobrindo os
// padrões usados nos jobs do sistema. Não substitui uma lib completa — atende
// os ~15 crons do catálogo de notificações.

const MINUTES = (m: string) => (m === "0" ? "00" : m.padStart(2, "0"));

const DOW_NAMES: Record<string, string> = {
  "0": "domingo",
  "1": "segunda",
  "2": "terça",
  "3": "quarta",
  "4": "quinta",
  "5": "sexta",
  "6": "sábado",
};

function formatDow(dow: string): string | null {
  if (dow === "*") return null;
  if (dow === "1-5") return "seg a sex";
  if (dow === "6,0" || dow === "0,6") return "fim de semana";
  const parts = dow.split(",").map((p) => DOW_NAMES[p] ?? p);
  return parts.join(", ");
}

function formatDom(dom: string): string | null {
  if (dom === "*") return null;
  if (dom === "28-31") return "nos últimos dias do mês (28-31)";
  if (dom.includes(",")) return `dias ${dom.split(",").join(", ")}`;
  return `dia ${dom}`;
}

export function humanizeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [minute, hour, dom, month, dow] = parts;

  // Time
  let time = "";
  if (minute.startsWith("*/")) {
    time = `a cada ${minute.slice(2)} minutos`;
  } else if (hour === "*") {
    time = `a cada hora, no minuto ${MINUTES(minute)}`;
  } else {
    time = `${hour.padStart(2, "0")}:${MINUTES(minute)}`;
  }

  const dowLabel = formatDow(dow);
  const domLabel = formatDom(dom);
  const monthLabel = month === "*" ? null : `mês ${month}`;

  const when: string[] = [];
  if (domLabel) when.push(domLabel);
  if (dowLabel) when.push(dowLabel);
  if (monthLabel) when.push(monthLabel);

  if (minute.startsWith("*/")) return time;

  if (when.length === 0) return `Diariamente às ${time}`;
  return `${when.join(", ")} às ${time}`;
}
