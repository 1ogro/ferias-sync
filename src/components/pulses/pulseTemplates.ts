import type { CreateSurveyInput } from "@/hooks/usePulses";

export interface PulseTemplate {
  id: "self-weekly" | "peer-monthly" | "kudos-weekly";
  label: string;
  emoji: string;
  description: string;
  values: Omit<CreateSurveyInput, "next_run_at">;
}

export const PULSE_TEMPLATES: PulseTemplate[] = [
  {
    id: "self-weekly",
    label: "Check-in semanal de bem-estar",
    emoji: "👤",
    description: "Autoavaliação rápida com escala 1–5 e comentário opcional. Disparo semanal.",
    values: {
      title: "Check-in semanal de bem-estar",
      description: "Como você está se sentindo nesta semana?",
      anonymous: true,
      tone: "neutral",
      kind: "self",
      peer_anonymous: true,
      frequency: "weekly",
      target_scope: "all",
      target_team_id: null,
      target_team_ids: null,
      target_person_ids: null,
      questions: [
        { position: 0, question_text: "Como você está se sentindo nesta semana?", question_type: "scale_1_5", required: true },
        { position: 1, question_text: "Quer compartilhar algo? (opcional)", question_type: "open_text", required: false },
      ],
    },
  },
  {
    id: "peer-monthly",
    label: "Avaliação entre pares — mensal",
    emoji: "👥",
    description: "Feedback construtivo entre colegas do time, anônimo, uma vez por mês.",
    values: {
      title: "Avaliação entre pares — mensal",
      description: "Feedback construtivo entre colegas do time.",
      anonymous: true,
      tone: "neutral",
      kind: "peer",
      peer_anonymous: true,
      frequency: "monthly",
      target_scope: "all",
      target_team_id: null,
      target_team_ids: null,
      target_person_ids: null,
      questions: [
        { position: 0, question_text: "Como foi colaborar com essa pessoa neste mês?", question_type: "scale_1_5", required: true },
        { position: 1, question_text: "Um feedback construtivo para essa pessoa", question_type: "open_text", required: false },
      ],
    },
  },
  {
    id: "kudos-weekly",
    label: "Kudos da semana",
    emoji: "🎉",
    description: "Lembrete semanal no Slack para reconhecer colegas. Todas as categorias liberadas.",
    values: {
      title: "Kudos da semana",
      description: "Lembrete semanal para reconhecer um colega.",
      anonymous: false,
      tone: "casual",
      kind: "kudos",
      peer_anonymous: true,
      kudos_categories: ["teamwork", "innovation", "delivery", "leadership", "customer"],
      kudos_channel: null,
      prompt_text: "🎉 Reconheça um colega que fez a diferença esta semana!",
      frequency: "weekly",
      target_scope: "all",
      target_team_id: null,
      target_team_ids: null,
      target_person_ids: null,
      questions: [],
    },
  },
];
