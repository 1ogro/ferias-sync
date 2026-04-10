

## Plano: Permitir gestores e diretores cadastrarem novos colaboradores

### Situação atual
- O botão "Novo Colaborador" só aparece para **gestores** (`isManager`), não para diretores.
- O formulário `NewCollaboratorForm` hardcoda `papel: Papel.COLABORADOR` e `gestor_id: person.id`.
- A RLS de INSERT na `pending_people` exige que `created_by` seja um `GESTOR` — diretores são bloqueados pelo banco.
- Diretores deveriam poder cadastrar qualquer tipo (COLABORADOR, GESTOR, DIRETOR) e atribuir qualquer gestor.

### Mudanças

#### 1. Migração: Atualizar RLS de INSERT na `pending_people`
- Adicionar política permitindo diretores/admins inserirem em `pending_people`.
- A política atual (`Gestores podem criar cadastros pendentes`) permanece para gestores.

#### 2. `src/components/NewCollaboratorForm.tsx`
- Aceitar prop `isDirector` para controlar funcionalidades extras.
- **Diretores**: exibir campo de seleção de `papel` (COLABORADOR, GESTOR, DIRETOR) e campo de seleção de `gestor_id` (lista de gestores/diretores do sistema).
- **Gestores**: manter comportamento atual (papel fixo COLABORADOR, gestor_id = próprio ID).
- Atualizar descrição do dialog conforme o papel do criador (diretor não precisa de aprovação → cadastro direto via `approve_pending_person` auto-aprovado, ou inserção direta na `people`).

#### 3. `src/pages/Admin.tsx`
- Exibir botão "Novo Colaborador" também para diretores (`isManager || isDirector`).
- Passar prop `isDirector` ao `NewCollaboratorForm`.
- Para diretores: após o insert em `pending_people`, auto-aprovar chamando a RPC `approve_pending_person` imediatamente — mantendo o fluxo auditável sem etapa manual extra.

### Arquivos a alterar
- Nova migração SQL (RLS para diretores em `pending_people`)
- `src/components/NewCollaboratorForm.tsx` — campos extras para diretor, auto-aprovação
- `src/pages/Admin.tsx` — exibir botão para diretores, passar prop

### Impacto
- Gestores continuam cadastrando colaboradores do seu time (pendente de aprovação).
- Diretores cadastram qualquer colaborador com aprovação automática.
- Auditoria mantida via `audit_logs` e registro em `pending_people`.

