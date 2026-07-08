// Catálogo curado de todas as notificações do sistema.
// Alimenta o painel administrativo em /admin/notificacoes.

export type NotificationChannel = "slack_dm" | "slack_canal" | "email";

export type NotificationCategory =
  | "Férias"
  | "Cadastro"
  | "Aniversários"
  | "Engajamento"
  | "Pulses"
  | "Autenticação"
  | "Admin";

export type TriggerType = "evento" | "cron" | "manual";

export interface NotificationCatalogEntry {
  id: string;
  nome: string;
  descricao: string;
  categoria: NotificationCategory;
  gatilho: {
    tipo: TriggerType;
    detalhe: string;
    cronExpr?: string;
  };
  publico: string[];
  canais: NotificationChannel[];
  edgeFunction: string;
  ativo: boolean;
}

export const NOTIFICATIONS_CATALOG: NotificationCatalogEntry[] = [
  // ============ FÉRIAS / SOLICITAÇÕES ============
  {
    id: "vacation-request-created-manager",
    nome: "Nova solicitação de férias",
    descricao: "Notifica o gestor direto quando um colaborador cria um pedido de férias.",
    categoria: "Férias",
    gatilho: { tipo: "evento", detalhe: "Colaborador cria nova solicitação" },
    publico: ["Gestor direto"],
    canais: ["slack_dm", "email"],
    edgeFunction: "slack-notification",
    ativo: true,
  },
  {
    id: "vacation-approved-collaborator",
    nome: "Solicitação aprovada",
    descricao: "Avisa o colaborador quando o pedido recebe aprovação do gestor ou aprovação final do diretor.",
    categoria: "Férias",
    gatilho: { tipo: "evento", detalhe: "Gestor ou diretor aprova o pedido" },
    publico: ["Colaborador"],
    canais: ["slack_dm", "email"],
    edgeFunction: "notify-approved-collaborator",
    ativo: true,
  },
  {
    id: "vacation-rejected-collaborator",
    nome: "Solicitação rejeitada",
    descricao: "Avisa o colaborador quando o pedido é rejeitado, com o motivo informado.",
    categoria: "Férias",
    gatilho: { tipo: "evento", detalhe: "Gestor ou diretor rejeita o pedido" },
    publico: ["Colaborador"],
    canais: ["slack_dm", "email"],
    edgeFunction: "slack-notification",
    ativo: true,
  },
  {
    id: "vacation-daily-pending-reminder",
    nome: "Lembrete diário de pedidos pendentes",
    descricao: "Cutuca gestores com pedidos aguardando aprovação há mais de 3 dias.",
    categoria: "Férias",
    gatilho: { tipo: "cron", detalhe: "Seg a sex às 09:00", cronExpr: "0 9 * * 1-5" },
    publico: ["Gestor direto"],
    canais: ["slack_dm", "email"],
    edgeFunction: "send-scheduled-reminders",
    ativo: true,
  },
  {
    id: "vacation-monthly-alerts",
    nome: "Alertas mensais de saldo de férias",
    descricao: "Aviso mensal para colaboradores próximos do vencimento do período aquisitivo.",
    categoria: "Férias",
    gatilho: { tipo: "cron", detalhe: "Todo dia 1 às 08:00", cronExpr: "0 8 1 * *" },
    publico: ["Colaborador", "Gestor direto"],
    canais: ["slack_dm", "email"],
    edgeFunction: "send-scheduled-reminders",
    ativo: true,
  },
  {
    id: "vacation-weekly-director",
    nome: "Lembrete semanal do diretor",
    descricao: "Resumo semanal para o diretor de pedidos aguardando aprovação final.",
    categoria: "Férias",
    gatilho: { tipo: "cron", detalhe: "Segundas às 10:00", cronExpr: "0 10 * * 1" },
    publico: ["Diretor"],
    canais: ["slack_dm"],
    edgeFunction: "send-scheduled-reminders",
    ativo: true,
  },
  {
    id: "vacation-weekly-open-digest",
    nome: "Digest semanal de pedidos abertos",
    descricao: "E-mail consolidado com todos os pedidos em aberto no time do gestor.",
    categoria: "Férias",
    gatilho: { tipo: "cron", detalhe: "Segundas às 09:00", cronExpr: "0 9 * * 1" },
    publico: ["Gestor direto"],
    canais: ["email"],
    edgeFunction: "send-weekly-open-requests-digest",
    ativo: true,
  },
  {
    id: "vacation-request-updated",
    nome: "Solicitação editada",
    descricao: "Notifica envolvidos quando uma solicitação já aprovada é editada ou cancelada.",
    categoria: "Férias",
    gatilho: { tipo: "evento", detalhe: "Colaborador edita/cancela pedido" },
    publico: ["Gestor direto", "Diretor"],
    canais: ["slack_dm", "email"],
    edgeFunction: "slack-notification",
    ativo: true,
  },

  // ============ CADASTRO ============
  {
    id: "onboarding-pending-approved",
    nome: "Cadastro pendente aprovado",
    descricao: "Notifica o novo colaborador quando o diretor aprova seu cadastro.",
    categoria: "Cadastro",
    gatilho: { tipo: "evento", detalhe: "Diretor aprova pending_people" },
    publico: ["Colaborador"],
    canais: ["email", "slack_dm"],
    edgeFunction: "notify-approved-collaborator",
    ativo: true,
  },
  {
    id: "registration-reminders-weekly",
    nome: "Lembrete semanal para completar cadastro",
    descricao: "Cutuca colaboradores com perfil incompleto (dados de contrato/pagamento).",
    categoria: "Cadastro",
    gatilho: { tipo: "cron", detalhe: "Segundas às 12:00", cronExpr: "0 12 * * 1" },
    publico: ["Colaborador"],
    canais: ["slack_dm", "email"],
    edgeFunction: "send-registration-reminders",
    ativo: true,
  },
  {
    id: "registration-reminders-month-end",
    nome: "Lembrete de fim de mês para cadastro",
    descricao: "Reforço em fim de mês para colaboradores com cadastro pendente.",
    categoria: "Cadastro",
    gatilho: { tipo: "cron", detalhe: "Dias 28-31 às 13:00", cronExpr: "0 13 28-31 * *" },
    publico: ["Colaborador"],
    canais: ["slack_dm", "email"],
    edgeFunction: "send-registration-reminders",
    ativo: true,
  },

  // ============ ANIVERSÁRIOS / CONTRATO ============
  {
    id: "birthday-digest",
    nome: "Aniversariantes do período",
    descricao: "Posta no canal a lista de aniversariantes do próximo bloco (dias 1, 10, 20, 30).",
    categoria: "Aniversários",
    gatilho: { tipo: "cron", detalhe: "Dias 1, 10, 20 e 30 às 12:00", cronExpr: "0 12 1,10,20,30 * *" },
    publico: ["Canal público"],
    canais: ["slack_canal"],
    edgeFunction: "send-birthday-digest",
    ativo: true,
  },
  {
    id: "daily-anniversaries",
    nome: "Aniversariantes do dia",
    descricao: "Parabeniza no canal público quem faz aniversário no dia.",
    categoria: "Aniversários",
    gatilho: { tipo: "cron", detalhe: "Diariamente às 12:00", cronExpr: "0 12 * * *" },
    publico: ["Canal público", "Aniversariante"],
    canais: ["slack_canal", "slack_dm"],
    edgeFunction: "send-daily-anniversaries",
    ativo: true,
  },
  {
    id: "contract-anniversary-checkpoints",
    nome: "Checkpoints de aniversário de contrato",
    descricao: "Avisos sobre novo período aquisitivo de férias liberado por tempo de casa.",
    categoria: "Aniversários",
    gatilho: { tipo: "cron", detalhe: "Dias 1, 10, 20 e 30 às 12:00", cronExpr: "0 12 1,10,20,30 * *" },
    publico: ["Colaborador", "Gestor direto"],
    canais: ["slack_dm", "email"],
    edgeFunction: "send-contract-anniversary-notifications",
    ativo: true,
  },
  {
    id: "contract-anniversary-accrual",
    nome: "Concessão automática de saldo de férias",
    descricao: "Job silencioso que credita dias de férias no aniversário de contrato (não envia mensagem — dispara os checkpoints acima).",
    categoria: "Aniversários",
    gatilho: { tipo: "cron", detalhe: "Diariamente às 06:00", cronExpr: "0 6 * * *" },
    publico: ["Sistema"],
    canais: [],
    edgeFunction: "apply-contract-anniversary-accrual",
    ativo: true,
  },

  // ============ ENGAJAMENTO ============
  {
    id: "kudos-sent-recipient",
    nome: "Kudos recebido",
    descricao: "Notifica o destinatário quando alguém envia um shout-out. Opcionalmente também posta no canal escolhido.",
    categoria: "Engajamento",
    gatilho: { tipo: "evento", detalhe: "Envio de kudos (app ou modal Slack)" },
    publico: ["Destinatário do kudos", "Canal público (opcional)"],
    canais: ["slack_dm", "slack_canal"],
    edgeFunction: "kudos-send",
    ativo: true,
  },
  {
    id: "kudos-notify-managers",
    nome: "Kudos visível para gestores",
    descricao: "Avisa gestor direto e diretores da área quando um membro do time recebe kudos.",
    categoria: "Engajamento",
    gatilho: { tipo: "evento", detalhe: "Após inserção do kudos (fire-and-forget)" },
    publico: ["Gestor direto", "Diretor"],
    canais: ["slack_dm"],
    edgeFunction: "kudos-notify-managers",
    ativo: true,
  },
  {
    id: "engagement-monthly-report",
    nome: "Relatório mensal de engajamento",
    descricao: "Resumo do mês anterior de kudos, ranking e destaques por sub-time.",
    categoria: "Engajamento",
    gatilho: { tipo: "cron", detalhe: "Todo dia 1 às 09:00", cronExpr: "0 9 1 * *" },
    publico: ["Diretor", "Canal público"],
    canais: ["slack_canal", "email"],
    edgeFunction: "engagement-monthly-report",
    ativo: true,
  },
  {
    id: "biscoito-slash",
    nome: "Modal /biscoito no Slack",
    descricao: "Abre o modal de envio de kudos direto do Slack via comando slash.",
    categoria: "Engajamento",
    gatilho: { tipo: "manual", detalhe: "Usuário digita /biscoito no Slack" },
    publico: ["Autor do comando"],
    canais: ["slack_dm"],
    edgeFunction: "slack-slash-biscoito",
    ativo: true,
  },

  // ============ PULSES ============
  {
    id: "pulse-dispatch",
    nome: "Envio de pulse survey",
    descricao: "Dispara perguntas de pulse para os destinatários agendados no momento certo (respeita janela e quiet hours).",
    categoria: "Pulses",
    gatilho: { tipo: "cron", detalhe: "A cada 15 minutos", cronExpr: "*/15 * * * *" },
    publico: ["Destinatários do pulse"],
    canais: ["slack_dm"],
    edgeFunction: "pulse-dispatch",
    ativo: true,
  },
  {
    id: "pulse-reminders",
    nome: "Lembretes de pulse não respondido",
    descricao: "Reenvia lembretes para quem ainda não respondeu, respeitando o intervalo configurado.",
    categoria: "Pulses",
    gatilho: { tipo: "cron", detalhe: "A cada 15 minutos", cronExpr: "*/15 * * * *" },
    publico: ["Destinatários pendentes"],
    canais: ["slack_dm"],
    edgeFunction: "pulse-reminders",
    ativo: true,
  },
  {
    id: "pulse-response-notify",
    nome: "Notificação de resposta de pulse",
    descricao: "Encaminha respostas de texto livre / peer review para o PO/diretor responsável pelo pulse.",
    categoria: "Pulses",
    gatilho: { tipo: "evento", detalhe: "Colaborador responde pulse" },
    publico: ["PO do pulse", "Diretor"],
    canais: ["slack_dm"],
    edgeFunction: "pulse-response-notify",
    ativo: true,
  },

  // ============ AUTENTICAÇÃO ============
  {
    id: "password-reset-slack",
    nome: "Recuperação de senha via Slack",
    descricao: "Envia link temporário de reset de senha por DM no Slack.",
    categoria: "Autenticação",
    gatilho: { tipo: "manual", detalhe: "Usuário pede reset em /auth" },
    publico: ["Usuário solicitante"],
    canais: ["slack_dm"],
    edgeFunction: "send-password-reset-slack",
    ativo: true,
  },
  {
    id: "admin-invite",
    nome: "Convite de admin/gestor",
    descricao: "E-mail com link de primeiro acesso quando um diretor promove usuário a admin/gestor.",
    categoria: "Admin",
    gatilho: { tipo: "evento", detalhe: "Diretor promove usuário via painel admin" },
    publico: ["Novo admin/gestor"],
    canais: ["email"],
    edgeFunction: "admin-auth-management",
    ativo: true,
  },
];

export const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  slack_dm: "Slack DM",
  slack_canal: "Slack canal",
  email: "E-mail",
};

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  Férias: "Férias",
  Cadastro: "Cadastro",
  Aniversários: "Aniversários",
  Engajamento: "Engajamento",
  Pulses: "Pulses",
  Autenticação: "Autenticação",
  Admin: "Admin",
};

export const ALL_PUBLICS = Array.from(
  new Set(NOTIFICATIONS_CATALOG.flatMap((n) => n.publico)),
).sort();
