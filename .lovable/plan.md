## Objetivo

Evitar duplicidade quando um kudo é enviado no Slack para alguém cujo email do Slack já está cadastrado como `email_pessoal` de uma pessoa ativa. Consolidar os `pending_people` existentes que já batem com uma pessoa (via `slack_user_id` ou email pessoal) e migrar quaisquer atribuições de pontuação.

## Contexto encontrado

- `people` já tem `email_pessoal` e `slack_user_id`; `findPersonBySlackIdentity` (em `slack-interactions/index.ts`) já resolve por `slack_user_id → email → email_pessoal` e faz backfill do `slack_user_id` na pessoa quando o match veio pelo email.
- Ainda assim existem 4 `pending_people` (Antenor Junior x2, Renato Albuquerque x2) cujo email bate com `people.email_pessoal` e cujo `slack_user_id` já está gravado na pessoa correspondente — precisam ser marcados como merged.
- Não há kudos com `to_person_id IS NULL` nem `engagement_points` órfãos hoje, então a migração de pontos é preventiva (para o caso de aparecerem entradas antigas).

## Mudanças

### 1. Reforço no fluxo de envio de kudo (`supabase/functions/slack-interactions/index.ts`)

No `ensurePending` (dentro do `biscoito_submit`) e no handler equivalente do slash command:
- Antes de inserir/atualizar `pending_people`, se `findPersonBySlackIdentity` casar via `email_pessoal`, além de fazer o backfill do `slack_user_id` (já existe), **não criar** pendente e **descartar** pendentes anteriores do mesmo Slack/email marcando-os como `MERGED` (novo status ou usar `REJEITADO` + `rejection_reason='merged_into:<person_id>'`).
- Garantir que a resolução do destinatário (`toRaw.startsWith("slack:")`) sempre passe o email do Slack para o lookup — hoje o fast-path por `slack_user_id` ignora o email, então adicionar fallback: se o fast-path não achou, buscar users.info e tentar por `email_pessoal` antes de cair em pendente.

### 2. Função de merge reutilizável

Criar RPC `public.merge_pending_into_person(pending_id uuid, person_id text)` (SECURITY DEFINER) que, em uma transação:
- Atualiza `kudos.to_person_id`/`from_person_id` quando estiverem NULL e o `to_slack_user_id`/`from_slack_user_id` corresponder ao slack do pendente.
- Atualiza `engagement_points.person_id` se algum registro apontar para o id do pendente (defensivo).
- Faz backfill de `people.slack_user_id` se estiver vazio.
- Marca o `pending_people` com `status='MERGED'` (adicionar valor ao check/enum se existir) + `reviewed_at=now()` + `director_notes='auto-merge por email_pessoal'`.

Usar essa RPC tanto no `ensurePending` quanto no script de limpeza.

### 3. Migração de limpeza única

Rodar, dentro da mesma migration, um bloco que percorre `pending_people` onde `status IN ('PENDENTE','APROVADO','REJEITADO')` e existe uma pessoa ativa com match por `slack_user_id` ou `email_pessoal`, chamando `merge_pending_into_person`. Isso resolve os 4 registros atuais (Antenor, Renato).

### 4. UI (mínimo)

Nenhuma mudança de UI necessária — os pendentes marcados como `MERGED` deixam de aparecer nas listas de aprovação (filtrar por `status='PENDENTE'` já é o padrão). Se algum componente listar todos os status, adicionar filtro para esconder `MERGED`.

## Detalhes técnicos

- Novo status `MERGED` em `pending_people.status` (hoje é TEXT livre, sem check constraint — validar antes de migrar).
- RPC concede `EXECUTE` a `authenticated` e `service_role`.
- Audit log: gravar `audit_logs` com `acao='PENDING_MERGED'`, `entidade_id=pending_id`, detalhes com `person_id` alvo.
- Não alterar `slack-slash-biscoito` (o fluxo principal passa por `slack-interactions`).

## Fora de escopo

- UI para desfazer merge (pode ser feito manualmente via SQL se necessário).
- Merge entre dois registros ativos de `people` (o pedido é sobre Slack↔pessoa cadastrada).
