# Novo nível de gestão: Gerente

Criar o papel **GERENTE**, posicionado entre Gestor e Diretor. Ele não entra no fluxo de aprovação — atua como camada de visibilidade e gestão de férias com alcance equivalente ao do diretor, sem acesso administrativo.

## O que o Gerente poderá fazer

- Gestão de férias integral (mesma visão e ações do diretor): Gestão do Time completa, resumo consolidado, saldos, recálculos, ausências ativas, capacidade de time, licenças médicas, solicitações históricas.
- Caixa de Entrada com visão ampla (leitura/acompanhamento), sem virar etapa obrigatória de aprovação das solicitações.
- Ferramentas de engajamento completas: enviar kudos (inclusive múltiplos destinatários), ver feed, criar e acompanhar pulses.

## O que o Gerente NÃO poderá fazer

- Nenhum acesso ao painel de administração (`/admin`, `/admin/notificacoes`, `/admin/mescladas`), integrações, importações/exportações de planilhas nem aprovação de cadastros pendentes.
- Não altera o fluxo de aprovação (Gestor → Diretor permanece igual).
- Não aparece no ranking de engajamento do time nem no global — igual aos diretores (a pontuação individual continua sendo contabilizada e exibida no card pessoal).
- Visibilidade parcial de pulses criados por diretores: vê o pulse e as métricas agregadas do escopo abaixo dele, mas sem notas individuais nem respostas/interações de pessoas de nível igual ou superior (Gerente e Diretor).

## Como será implementado

### Banco de dados
- Adicionar `GERENTE` como valor válido de `people.papel` e de `pending_people.papel` (coluna de texto; atualizar qualquer CHECK existente).
- Criar função `security definer` `public.is_manager_level()` (retorna verdadeiro para GERENTE, DIRETOR ou admin) e usá-la para ampliar as políticas de leitura hoje restritas a `papel IN ('DIRETOR','ADMIN')` nas tabelas de gestão de férias: `requests`, `people`, `vacation_balances`, `medical_leaves`, `team_capacity_alerts`, `special_approvals`, `approvals`.
- Não estender ao Gerente as políticas de escrita administrativas (`pending_people`, `integration_settings`, `user_roles`, `audit_logs` de admin).
- `get_engagement_leaderboard`: excluir também `papel = 'GERENTE'` dos rankings global e de time.
- `get_pulse_responses_safe`: quando o chamador for GERENTE, filtrar respostas cujo respondente tenha papel GERENTE ou DIRETOR e omitir identificação individual.

### Frontend
- `src/lib/types.ts`: novo valor `Papel.GERENTE` + rótulo "Gerente".
- Introduzir helpers em `src/lib/utils.ts` (`isManagementLevel`, `canManageVacations`, `isAdminPanelAllowed`) e substituir as checagens espalhadas `papel === 'DIRETOR' || is_admin`:
  - `src/components/Header.tsx` (menu, badges, cor do badge do papel, links de onboarding)
  - `src/components/Dashboard.tsx` (visão ampla, contadores)
  - `src/pages/VacationManagement.tsx` (autorização e abas de diretor)
  - `src/pages/Inbox.tsx`, `src/pages/RequestDetail.tsx`, `src/pages/EditRequest.tsx` (visibilidade sim; ações de aprovação continuam restritas a Gestor/Diretor)
  - `src/pages/Engagement.tsx` (kudos múltiplos, criação de pulses; sem ranking)
- `src/pages/Admin.tsx` permanece bloqueado para Gerente; incluir "Gerente" nas listas de seleção de papel ao editar pessoas.
- `src/components/pulses/PulseResultsPanel.tsx`: exibir aviso de visão parcial quando o usuário for Gerente.

### Edge functions
- Ajustar as checagens de papel em `slack-interactions`, `kudos-send`, `send-scheduled-reminders` e `send-weekly-open-requests-digest` para tratar GERENTE como nível de gestão (visibilidade), mantendo a rota de aprovação inalterada.

## Depois de aprovado
Você poderá marcar as pessoas como "Gerente" na tela de administração; nenhuma pessoa muda de papel automaticamente.
