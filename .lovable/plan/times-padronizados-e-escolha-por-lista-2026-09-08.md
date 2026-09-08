# Times padronizados e escolha por lista

## O que muda para quem usa

- **Lista oficial de times.** Os times passam a ser cadastrados em um lugar só, com nome único. Nada de digitar o nome de novo a cada cadastro.
- **Correção do time duplicado.** "Asssistencial/Medico/Operadoras" (com erro de digitação) passa a ser "Assistencial/Médico/Operadoras". Os demais nomes ficam como estão. A pessoa que estava no nome errado passa a contar junto com o time certo em todos os relatórios (bem-estar, engajamento, férias, capacidade).
- **Escolha por pulldown.** Em vez de campo aberto, o time vira uma lista de seleção em:
  - cadastro de novo colaborador,
  - edição de pessoa na área de administração,
  - conclusão de perfil (primeiro acesso),
  - aprovação de cadastros pendentes.
- **Gerenciar times.** Uma seção nova na administração permite criar, renomear e desativar times. Disponível para admin, diretoria e gerentes. Times desativados somem do pulldown, mas continuam aparecendo no histórico de quem já estava neles.
- **Perfil do colaborador.** O colaborador vê seu time e pode **solicitar a troca** escolhendo o novo time na lista, com justificativa. A solicitação vai para aprovação pelo mesmo caminho já usado hoje para mudanças de dados (gerente do time ou diretoria).
- Se alguém estiver com um time fora da lista, o pulldown mostra o valor atual em destaque como "fora do padrão", para ser corrigido.

## Detalhes técnicos

Banco (migração):
- Nova tabela `public.teams`: `id uuid`, `nome text` único (case-insensitive via índice em `lower(nome)`), `ativo boolean default true`, `created_at`, `updated_at` + trigger. GRANT `select` para `authenticated`; `all` para `service_role`. RLS: leitura para todos autenticados; insert/update apenas para `is_admin_or_director()` ou `is_gerente_only()`/nível de gestão.
- Popular `teams` com os nomes distintos existentes de `people.sub_time` e `pending_people.sub_time`, já normalizados.
- Correção de dados (`UPDATE`, fora da migração de estrutura): `people` e `pending_people` com `sub_time = 'Asssistencial/Medico/Operadoras'` passam a `'Assistencial/Médico/Operadoras'`. Registro em `audit_logs`.
- `people.sub_time` e `pending_people.sub_time` seguem como texto (evita quebrar RPCs, funções de Slack e importações do Sheets que agregam por `sub_time`); a consistência passa a ser garantida pela UI e por trigger de validação leve que rejeita valor não existente em `teams` quando não nulo (permitindo os valores já existentes).
- `request_data_change` continua atendendo a solicitação de troca de time via `kind = 'PROFILE_DATA'` com `changes.sub_time`; `review_data_change` já aplica o campo.

Frontend:
- Novo `src/hooks/useTeams.ts`: `useTeams()` (ativos + valor atual), `useCreateTeam`, `useRenameTeam`, `useToggleTeamActive`.
- Novo `src/components/TeamSelect.tsx`: `Select` com os times ativos, opção de valor legado destacada e ação inline "novo time" para quem tem permissão.
- Substituir os `Input` por `TeamSelect` em `src/components/NewCollaboratorForm.tsx`, `src/pages/Admin.tsx` (form de pessoa), `src/pages/CompleteProfile.tsx` e `src/components/ApprovePendingCollaboratorDialog.tsx`.
- Nova aba/seção "Times" em `src/pages/Admin.tsx` para criar/renomear/desativar.
- `src/components/ProfileModal.tsx`: campo de time em modo solicitação, usando `TeamSelect` + justificativa, enviando para `request_data_change`.
- Filtros existentes por time (férias, engajamento, bem-estar, resumo de colaboradores) passam a listar a partir de `teams` quando disponível, mantendo o fallback atual.
