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

export enum ModeloContrato {
  PJ = "PJ",
  CLT = "CLT",
  CLT_ABONO_LIVRE = "CLT_ABONO_LIVRE",
  CLT_ABONO_FIXO = "CLT_ABONO_FIXO"
}

export enum TipoAusencia {
  DAYOFF = "DAYOFF",
  FERIAS = "FERIAS",
  LICENCA_MEDICA = "LICENCA_MEDICA",
  LICENCA_MATERNIDADE = "LICENCA_MATERNIDADE"
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
  RASCUNHO = "RASCUNHO",
  INFORMACOES_ADICIONAIS = "INFORMACOES_ADICIONAIS"
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
  modelo_contrato?: ModeloContrato; // Modelo de contrato: PJ ou CLT
  maternity_extension_days?: number; // Extension days beyond 120 for maternity leave
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
  isHistorical?: boolean;
  originalCreatedAt?: Date;
  originalChannel?: string;
  adminObservations?: string;
  dias_abono?: number; // Number of vacation days sold (abono)
  data_prevista_parto?: Date; // Expected delivery date for maternity leave
  is_contract_exception?: boolean; // If maternity leave has extension beyond 120 days
  contract_exception_justification?: string; // Justification for extension
  portal_rh_solicitado?: boolean; // If CLT vacation was requested in Portal RH
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
  [Status.RASCUNHO]: "Rascunho",
  [Status.INFORMACOES_ADICIONAIS]: "Informações Adicionais"
};

export const TIPO_LABELS = {
  [TipoAusencia.DAYOFF]: "Day Off",
  [TipoAusencia.FERIAS]: "Férias",
  [TipoAusencia.LICENCA_MEDICA]: "Licença Médica",
  [TipoAusencia.LICENCA_MATERNIDADE]: "Licença Maternidade"
};

export const MODELO_CONTRATO_LABELS = {
  [ModeloContrato.PJ]: "Pessoa Jurídica",
  [ModeloContrato.CLT]: "CLT",
  [ModeloContrato.CLT_ABONO_LIVRE]: "CLT com Abono Livre",
  [ModeloContrato.CLT_ABONO_FIXO]: "CLT com Abono Fixo"
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
  medical_leave_person_id: string;
  medical_leave_id: string;
  affected_people_count: number;
  period_start: Date;
  period_end: Date;
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

// Maternity Leave Validation
export interface MaternityLeaveValidation {
  valid: boolean;
  message?: string;
  total_days?: number;
  clt_days?: number;
  extension_days?: number;
}

// Pending People (Approval workflow for new employee registrations)
export interface PendingPerson {
  id: string;
  nome: string;
  email: string;
  cargo?: string;
  local?: string;
  sub_time?: string;
  papel: Papel;
  gestor_id: string;
  gestor?: Person;
  data_contrato?: string;
  data_nascimento?: string;
  modelo_contrato?: ModeloContrato;
  status: 'PENDENTE' | 'APROVADO' | 'REJEITADO';
  created_by: string;
  creator?: Person;
  created_at: Date;
  reviewed_by?: string;
  reviewer?: Person;
  reviewed_at?: Date;
  rejection_reason?: string;
  director_notes?: string;
}