import { Person, Request, Papel, TipoAusencia, Status } from "./types";

export const mockUsers: Person[] = [
  {
    id: "1",
    nome: "Ana Silva",
    email: "ana.silva@empresa.com",
    cargo: "Desenvolvedora Sênior",
    local: "São Paulo",
    subTime: "Tech",
    papel: Papel.COLABORADOR,
    is_admin: false,
    ativo: true,
    gestorId: "2"
  },
  {
    id: "2", 
    nome: "Carlos Santos",
    email: "carlos.santos@empresa.com",
    cargo: "Tech Lead",
    local: "São Paulo",
    subTime: "Tech",
    papel: Papel.GESTOR,
    is_admin: false,
    ativo: true,
    gestorId: "3"
  },
  {
    id: "3",
    nome: "Maria Oliveira", 
    email: "maria.oliveira@empresa.com",
    cargo: "Diretora de Tecnologia",
    local: "São Paulo",
    subTime: "Tech",
    papel: Papel.DIRETOR,
    is_admin: true, // Admin para testar funcionalidades administrativas
    ativo: true
  },
  {
    id: "4",
    nome: "João Pereira",
    email: "joao.pereira@empresa.com", 
    cargo: "Analista de Marketing",
    local: "Rio de Janeiro",
    subTime: "Marketing",
    papel: Papel.COLABORADOR,
    is_admin: false,
    ativo: true,
    gestorId: "5"
  },
  {
    id: "5",
    nome: "Fernanda Costa",
    email: "fernanda.costa@empresa.com",
    cargo: "Gerente de Marketing", 
    local: "Rio de Janeiro",
    subTime: "Marketing",
    papel: Papel.GESTOR,
    is_admin: false,
    ativo: true,
    gestorId: "3"
  }
];

export const mockRequests: Request[] = [
  {
    id: "req-1",
    requesterId: "1",
    requester: mockUsers[0],
    tipo: TipoAusencia.FERIAS,
    inicio: new Date("2024-12-15"),
    fim: new Date("2024-12-28"),
    status: Status.EM_ANALISE_GESTOR,
    justificativa: "Férias de fim de ano",
    conflitoFlag: false,
    createdAt: new Date("2024-11-10"),
    updatedAt: new Date("2024-11-10")
  },
  {
    id: "req-2", 
    requesterId: "4",
    requester: mockUsers[3],
    tipo: TipoAusencia.DAYOFF,
    inicio: new Date("2024-11-25"),
    fim: new Date("2024-11-25"),
    status: Status.APROVADO_FINAL,
    conflitoFlag: false,
    createdAt: new Date("2024-11-05"),
    updatedAt: new Date("2024-11-08")
  },
  {
    id: "req-3",
    requesterId: "1", 
    requester: mockUsers[0],
    tipo: TipoAusencia.DAYOFF,
    inicio: new Date("2024-12-02"),
    fim: new Date("2024-12-02"),
    status: Status.PENDENTE,
    conflitoFlag: true,
    conflitoRefs: "req-4",
    createdAt: new Date("2024-11-11"),
    updatedAt: new Date("2024-11-11")
  }
];

// Current user mock
export const currentUser: Person = mockUsers[0];