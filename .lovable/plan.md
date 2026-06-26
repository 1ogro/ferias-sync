## Objetivo

Permitir que `/biscoito` funcione com qualquer usuário do Slack, mesmo quem não está no app. O modal lista todo mundo do workspace, marca [slack only] quem não tem cadastro, registra o biscoito mesmo assim e cria a solicitação de cadastro em `pending_people` (com badge in-app + DM para admins). Os pontos só entram no painel de Engajamento depois do cadastro aprovado — e aí são creditados retroativos (10 pts para cada recebimento, 2 pts para cada envio).

## Mudanças

### 1. Schema (migration)

**`kudos`** — passar a aceitar referências Slack-only:
- `from_person_id` e `to_person_id`: tornar `nullable` (drop NOT NULL).
- Novas colunas: `from_slack_user_id text`, `to_slack_user_id text`, `from_slack_email text`, `to_slack_email text`, `from_slack_name text`, `to_slack_name text`, `pending_from boolean default false`, `pending_to boolean default false`.
- Constraint: `CHECK ( (from_person_id IS NOT NULL OR from_slack_user_id IS NOT NULL) AND (to_person_id IS NOT NULL OR to_slack_user_id IS NOT NULL) )`.
- Índices em `from_slack_email`, `to_slack_email`, `from_slack_user_id`, `to_slack_user_id`.

**`pending_people`** — adicionar campos para origem Slack:
- `source text default 'manual'` (valores: `manual`, `slack_biscoito`).
- `slack_user_id text`, `slack_request_count int default 1`, `last_slack_request_at timestamptz`.
- Garantir grants/policies já existentes continuem válidos (somente acrescentar colunas).

**RPC `approve_pending_person`** — após criar o `people`, varrer `kudos` cujo `from_slack_email`/`to_slack_email` (ou `slack_user_id`) bate com a pessoa recém-criada:
- Preencher `from_person_id`/`to_person_id` e zerar `pending_from`/`pending_to` correspondentes.
- Para cada kudo onde `pending_to` virou false: `award_points(person, 10, 'kudo_received', kudo.id)`.
- Para cada kudo onde `pending_from` virou false: `award_points(person, 2, 'kudo_given', kudo.id)`.
- A unique constraint `(person_id, reason, source_id)` do `engagement_points` garante idempotência.

### 2. `supabase/functions/slack-slash-biscoito/index.ts`

- Listar usuários Slack via `users.list` paginando `next_cursor` (filtrar `deleted=false`, `is_bot=false`, `id != USLACKBOT`).
- Casar `email` com `people.ativo=true` em uma query única.
- Montar `peopleOptions` ordenado por nome:
  - App users: `text = nome`, `value = "app:<person_id>"`.
  - Slack-only: `text = "<display_name> [slack only]"`, `value = "slack:<slack_user_id>"`.
- Limite do Slack: 100 options por `static_select`. Se passar, manter os 100 primeiros e adicionar nota no `placeholder`. (Workspace atual ~35 users; folga grande.)
- Remover o próprio sender da lista.
- Validar sender: se o email do trigger não está em `people`, ainda permitir envio (sender vira slack-only) — não bloquear.

### 3. `supabase/functions/slack-interactions/index.ts` (`biscoito_submit`)

Substituir resolução do sender/recipient pelo seguinte fluxo:

1. **Sender**: `users.info(slackUserId)` → email. Procurar em `people`. Se não achar → sender é slack-only (guardar `slack_user_id`, `email`, `name`).
2. **Recipient**: parse do `value` selecionado:
   - `app:<id>` → busca `people` por id.
   - `slack:<id>` → `users.info(id)` para pegar email/name; tenta casar com `people` por email (se um usuário foi cadastrado depois de o modal abrir).
3. Validações:
   - sender e recipient não podem ser a mesma pessoa Slack/app.
   - mensagem 3-500 chars (já existe).
4. Insert em `kudos` com os novos campos. `pending_from`/`pending_to` = true quando o respectivo lado não tem `person_id`.
5. **Pontos**: chamar `award_points` somente para o lado que tem `person_id` (envio: 2 pts; recebimento: 10 pts). O lado pendente fica sem pontos até aprovação.
6. **`ensurePendingPerson(slack_user_id, email, name)`**: helper novo.
   - Se já existe `pending_people` com `slack_user_id` ou `email` em status `PENDENTE` → incrementa `slack_request_count`, atualiza `last_slack_request_at`.
   - Senão → insere `{ source: 'slack_biscoito', slack_user_id, email, nome: name, status: 'PENDENTE', created_by: sender?.id || null }`.
   - Chama 1x por kudo para cada lado pendente.
7. **Notificar admins** (best-effort, em `EdgeRuntime.waitUntil`):
   - Query `people` onde `is_admin=true AND ativo=true AND email IS NOT NULL`.
   - Para cada admin: `users.lookupByEmail` → `conversations.open` → `chat.postMessage` com texto tipo:  
     `🔔 Novo cadastro pendente do Slack: *<nome>* (<email>) enviou/recebeu um biscoito. Aprove em /vacation-management → Aprovações.`
   - Reutiliza padrão de fallback já existente em `notifyRecipientDM`.
8. Continuar postando o card no canal de origem e em `#time` (lógica atual mantida). No card, se um dos lados é pendente, anexar sufixo `(cadastro pendente)` no nome.
9. DM para o destinatário: se recipient é slack-only, mandar a DM ainda assim (já temos o `slack_user_id`, basta usar diretamente em `conversations.open`).

### 4. Frontend — badge in-app

- `src/hooks/usePendingPeople` (já existe ou similar usado em `PendingCollaboratorsList.tsx`): adicionar contador filtrando `source = 'slack_biscoito'` ou simplesmente `status='PENDENTE'`.
- Adicionar badge no item de menu/Header que leva à tela de aprovação (`src/components/Header.tsx` ou onde estiver o link "Aprovações/Pendentes"). Badge mostra total pendente; tooltip diz "X cadastros pendentes (incluindo solicitações do /biscoito)".
- Em `PendingCollaboratorCard.tsx`: quando `source = 'slack_biscoito'`, mostrar pill "via /biscoito" e contador de biscoitos pendentes (`slack_request_count`).

### 5. Feed de Engajamento

- Kudos com `pending_from` e/ou `pending_to` precisam aparecer no feed mesmo sem `person_id`. Em `useKudosFeed`:
  - Selecionar também `from_slack_name`, `to_slack_name`.
  - Coalesce no render: `from?.nome ?? from_slack_name ?? "Slack user"` + tag `[slack only]` quando pendente.
- Não muda leaderboard nem `useMyPoints` — pontos só existem após aprovação (correto).

## Validação

- `/biscoito` num canal: modal lista todos do Slack, com `[slack only]` em quem não tem cadastro. Verificar que o próprio sender não aparece.
- Enviar biscoito de app→slack-only: insert ok, `pending_to=true`, sem pontos para o recipient; card no canal + DM ao recipient; admins recebem DM; badge in-app +1.
- Enviar biscoito de slack-only→app: insert ok, `pending_from=true`, recipient já ganha 10 pts; sender sem pontos; admins notificados.
- Aprovar o pending → kudos passa a ter `from_person_id`/`to_person_id`, pontos retroativos creditados, feed/leaderboard refletem.
- Repetir aprovação não duplica pontos (unique do `engagement_points`).
- Rejeitar pending → kudos continuam, mas seguem pendentes até cadastro futuro.

## Fora de escopo

- Editar avatar/nome do bot.
- Importação em massa dos Slack users para o `people`.
- Mudanças no fluxo de aprovação além do registro retroativo de pontos.
- Limites/paginação acima de 100 colegas no `static_select` (workspace pequeno).
