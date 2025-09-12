export enum OrganizationalRole {
  COLABORADOR = "COLABORADOR",
  GESTOR = "GESTOR", 
  DIRETOR = "DIRETOR"
}

// Papéis organizacionais para fluxo de aprovação
export enum Papel {
  COLABORADOR = "COLABORADOR",
  GESTOR = "GESTOR", 
  DIRETOR = "DIRETOR"
}

export enum TipoAusencia {
  DAYOFF = "DAYOFF",
  FERIAS = "FERIAS"
}

export enum Status {
  PENDENTE = "PENDENTE",
  EM_ANALISE_GESTOR = "EM_ANALISE_GESTOR",
  APROVADO_1NIVEL = "APROVADO_1NIVEL", 
  EM_ANALISE_DIRETOR = "EM_ANALISE_DIRETOR",
  APROVADO_FINAL = "APROVADO_FINAL",
  REPROVADO = "REPROVADO",
  CANCELADO = "CANCELADO",
  REALIZADO = "REALIZADO",
  EM_ANDAMENTO = "EM_ANDAMENTO",
  RASCUNHO = "RASCUNHO"
}

export interface Person {
  id: string;
  nome: string;
  email: string;
  cargo?: string;
  local?: string;
  subTime?: string;
  papel: Papel; // Papel organizacional para fluxo de aprovação
  organizational_role?: OrganizationalRole | null;
  is_admin: boolean; // Permissão administrativa
  ativo: boolean;
  gestorId?: string;
  gestor?: Person;
  data_nascimento?: string; // Data de nascimento para cálculo de day-off
  data_contrato?: string; // Data de contrato para cálculo de férias
}

export interface Request {
  id: string;
  requesterId: string;
  requester: Person;
  tipo: TipoAusencia;
  inicio: Date | null;
  fim: Date | null;
  tipoFerias?: string;
  status: Status;
  justificativa?: string;
  conflitoFlag: boolean;
  conflitoRefs?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const STATUS_LABELS = {
  [Status.PENDENTE]: "Pendente",
  [Status.EM_ANALISE_GESTOR]: "Em Análise - Gestor",
  [Status.APROVADO_1NIVEL]: "Aprovado - 1º Nível", 
  [Status.EM_ANALISE_DIRETOR]: "Em Análise - Diretor",
  [Status.APROVADO_FINAL]: "Aprovado Final",
  [Status.REPROVADO]: "Reprovado",
  [Status.CANCELADO]: "Cancelado",
  [Status.REALIZADO]: "Realizado",
  [Status.EM_ANDAMENTO]: "Em Andamento",
  [Status.RASCUNHO]: "Rascunho"
};

export const TIPO_LABELS = {
  [TipoAusencia.DAYOFF]: "Day Off",
  [TipoAusencia.FERIAS]: "Férias"
};