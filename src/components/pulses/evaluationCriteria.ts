import type { PulseQuestion } from "@/hooks/usePulses";

export type CriteriaLevel = "colaborador" | "gestor" | "diretor";

export const CRITERIA_LEVEL_LABEL: Record<CriteriaLevel, string> = {
  colaborador: "Colaborador",
  gestor: "Gestor",
  diretor: "Diretor",
};

/** Critérios oficiais por nível (definidos pela liderança). */
export const EVALUATION_CRITERIA: Record<CriteriaLevel, string[]> = {
  colaborador: [
    "Respeita as normas e procedimentos, cuidando dos recursos como se fossem seus.",
    "Atende o cliente de forma clara, empática e ágil.",
    "Escuta atentamente, expressa com clareza e respeito.",
    "Executa suas tarefas de forma eficaz, identifica oportunidades de otimização de processos e sugere melhorias.",
    "Identifica problemas e propõe soluções.",
    "Compartilha informações e recursos, e contribui ativamente para o sucesso do grupo.",
    "Capaz de aprender novas habilidades, aceita feedback construtivo.",
  ],
  gestor: [
    "Identificação com a organização: Conecta equipe, propósito e responsabilidade com o negócio",
    "Liderança engajadora: Direciona a equipe para gerar qualidade e boa experiência",
    "Orientação para o cliente: Determina suas ações para excelência do atendimento ao cliente",
    "Comunicação e Relacionamento interpessoal: Usa a comunicação para direcionar execução",
    "Otimização de resultados: Organiza prioridades e sustenta execução consistente",
    "Iniciativa e Planejamento: Traduz prioridades em execução organizada",
    "Cooperação: Integra pessoas e áreas para sustentar execução",
    "Adaptação a mudanças: Apoia a equipe na adaptação a novos cenários",
  ],
  diretor: [
    "Apoia publicamente a Rede D'Or, empenhado no atingimento das metas. Motiva a equipe a se engajar nos projetos e iniciativas da Rede D'Or.",
    "Comunicação eficaz, oferece feedback, estimula o desenvolvimento de PDI, sabe delegar e reconhecer o bom desempenho.",
    "Promove uma cultura organizacional focada no cliente, tem escuta ativa, incentiva a equipe a priorizar a satisfação e o sucesso dos clientes em todas as interações e iniciativas.",
    "Comunica as metas e expectativas de forma clara e consistente, facilita reuniões produtivas e colaborativas, transmite diretrizes claras e compartilha informação.",
    "Desenvolve e implementa planos de ação eficazes para otimizar o desempenho. Monitora o progresso e fornece suporte e orientação conforme necessário.",
    "Desenvolve planos de curto e médio prazo para alcançar os objetivos da equipe. Monitora o progresso e ajusta os planos conforme necessário.",
    "Promove uma cultura de apoio mútuo, valoriza e encoraja a equipe para contribuir com suas habilidades e experiências e estabelece canais de comunicação eficazes.",
    "Ajusta os planos e estratégias com o time. Motiva e engaja a equipe durante períodos de transição.",
  ],
};

/** Perguntas completas: critérios em escala 1–5 por nível + comentário aberto comum. */
export function buildEvaluationQuestions(): PulseQuestion[] {
  const out: PulseQuestion[] = [];
  (Object.keys(EVALUATION_CRITERIA) as CriteriaLevel[]).forEach((level) => {
    EVALUATION_CRITERIA[level].forEach((text) =>
      out.push({ position: out.length, question_text: text, question_type: "scale_1_5", required: true, criteria_level: level })
    );
  });
  out.push({ position: out.length, question_text: "Comentários, pontos fortes e oportunidades de desenvolvimento (opcional)", question_type: "open_text", required: false, criteria_level: null });
  return out;
}

export const EVALUATION_FORMAT_LABEL: Record<string, string> = {
  "90": "90º — Gestor avalia liderados",
  "180": "180º — Autoavaliação + gestor",
  "270": "270º — Autoavaliação + gestor + pares",
};
