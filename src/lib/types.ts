export enum Papel {
  COLABORADOR = "COLABORADOR",
  GESTOR = "GESTOR", 
  DIRETOR = "DIRETOR",
  ADMIN = "ADMIN"
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
  REALIZADO = "REALIZADO"
}

export interface Person {
  id: string;
  nome: string;
  email: string;
  cargo?: string;
  local?: string;
  subTime?: string;
  papel: Papel;
  ativo: boolean;
  gestorId?: string;
  gestor?: Person;
}

export interface Request {
  id: string;
  requesterId: string;
  requester: Person;
  tipo: TipoAusencia;
  inicio: Date;
  fim: Date;
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
  [Status.REALIZADO]: "Realizado"
};

export const TIPO_LABELS = {
  [TipoAusencia.DAYOFF]: "Day Off",
  [TipoAusencia.FERIAS]: "Férias"
};