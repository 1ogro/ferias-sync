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
  FERIAS = "FERIAS",
  LICENCA_MEDICA = "LICENCA_MEDICA"
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
  [TipoAusencia.FERIAS]: "Férias",
  [TipoAusencia.LICENCA_MEDICA]: "Licença Médica"
};

// Medical Leave interfaces
export interface MedicalLeave {
  id: string;
  person_id: string;
  person?: Person;
  start_date: Date;
  end_date: Date;
  status: string;
  created_by: string;
  justification?: string;
  affects_team_capacity: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TeamCapacityAlert {
  id: string;
  team_id: string;
  period_start: Date;
  period_end: Date;
  medical_leave_person_id: string;
  affected_people_count: number;
  alert_status: string;
  director_notified_at?: Date;
  created_at: Date;
}

export interface SpecialApproval {
  id: string;
  request_id: string;
  medical_leave_id: string;
  manager_id: string;
  director_id?: string;
  manager_approval_date: Date;
  director_notification_date?: Date;
  justification: string;
  approved_despite_medical_leave: boolean;
  created_at: Date;
}