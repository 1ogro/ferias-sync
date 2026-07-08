
## Diagnóstico

O kudos de Isabela → Antenor Jr foi salvo como `pending_to` porque o lookup de destinatário faz apenas `people.email = <email do Slack>`. Antenor tem o Slack cadastrado com o email pessoal (`jr.antenor@gmail.com`), enquanto o `people.email` é o corporativo (`ajunior.instaflip@rededor.com.br`). Resultado: o kudo não atribuiu 10 pts ao Antenor e criou 2 entradas `pending_people` duplicadas com o mesmo `slack_user_id`.

O campo `email_pessoal` já existe nas tabelas `people` e `pending_people`, mas nenhum lookup do fluxo Slack o considera.

## Plano

### 1. Resolver Slack → pessoa também por `email_pessoal`

Alterar todos os pontos em `supabase/functions/slack-interactions/index.ts` que hoje fazem `people.email = <slack_email>` para casar por qualquer um dos dois campos (case-insensitive), sempre com `ativo = true`:

- `resolveRespondent` (pulses).
- Resolução do remetente no `kudos_submit` e no `biscoito_submit`.
- Resolução do destinatário quando `toRaw` começa com `slack:` (ambos handlers).

Ordem de prioridade: match em `email` corporativo primeiro; se não achar, tenta `email_pessoal`. Se achar por `email_pessoal` e o `people.slack_user_id` ainda estiver vazio, gravar o `slack_user_id` na pessoa (auto-vínculo).

### 2. `ensurePendingPerson`: não criar pendente quando já existe pessoa

Antes de criar/atualizar `pending_people`, verificar em `people` (ativo) se há match por:
- `slack_user_id`
- `email` corporativo
- `email_pessoal`

Se houver, apenas preencher o `slack_user_id` na pessoa (quando faltando) e **não** criar/atualizar `pending_people`. Isso evita gerar novos pendentes para colaboradores já cadastrados que usam email pessoal no Slack.

### 3. Migração retroativa dos kudos pendentes

Em uma migration única:

- Para cada `kudos` com `pending_to = true` e `to_slack_email` que casa com `people.email` ou `people.email_pessoal` (ativo): atualizar `to_person_id`, `pending_to = false`.
- Mesma coisa para `pending_from` / `from_slack_email` / `from_person_id`.
- Após o UPDATE, chamar `award_points` para cada kudo migrado (10 pts `kudo_received` para o destinatário, 2 pts `kudo_given` para o remetente, usando `source_id = kudo.id`). A constraint única `(person_id, reason, source_id)` já garante idempotência — não gera duplicidade se algum ponto já existia.
- Registrar em `audit_logs` (`entidade='kudos'`, `acao='PENDING_MERGE'`) os IDs migrados, com quem virou quem.

### 4. Consolidar `pending_people` órfãos

Na mesma migration:

- Selecionar `pending_people` cujo `email` OU `slack_user_id` casa com uma `people` ativa (via `email`, `email_pessoal` ou `slack_user_id`).
- Para status `PENDENTE`: marcar `status = 'REJEITADO'`, `rejection_reason = 'merged_into_person:<pessoa_id>'`, `reviewed_at = now()`.
- Se a pessoa correspondente ainda não tem `slack_user_id`, copiar do pendente.
- Registrar em `audit_logs` (`acao='PENDING_MERGE_CLEANUP'`) os IDs consolidados.

Casos concretos hoje:
- Pendentes `20b9db61…` e `4393e7eb…` (Antenor Junior, `jr.antenor@gmail.com`, `U01FMMTA8V9`) → merge em `pessoa_003`, popular `slack_user_id` no `pessoa_003`.
- Kudo `8033d87a-361b-45d8-a9e4-cf2bd217e563` (Isabela → Antenor) → vira `to_person_id = pessoa_003`, `pending_to = false`, e Antenor recebe os 10 pts que faltavam.

### 5. Sem alterações no frontend

O `useKudosFeed` já consome `to_person_nome`/`from_person_nome` do RPC — depois do merge, os kudos migrados passam a mostrar o nome da pessoa em vez do nome do Slack, sem mudança de código.

## Detalhes técnicos

Arquivos afetados:

- `supabase/functions/slack-interactions/index.ts`
  - `resolveRespondent`: query com `.or("email.eq.<x>,email_pessoal.eq.<x>")`.
  - Novo helper `findPersonBySlackIdentity({ slackUserId, email })` reutilizado em kudos e biscoito.
  - `ensurePendingPerson` e o `ensurePending` inline: checar `people` antes de mexer em `pending_people`.
- `supabase/migrations/<timestamp>_merge_slack_only_kudos.sql`
  - `UPDATE public.kudos` para `pending_to`/`pending_from`.
  - `SELECT award_points(...)` para cada linha migrada (via `DO $$ ... $$` ou `INSERT ... SELECT`).
  - `UPDATE public.pending_people SET status='REJEITADO', rejection_reason='merged_into_person:...'`.
  - `UPDATE public.people SET slack_user_id = <x> WHERE slack_user_id IS NULL AND email_pessoal = <slack_email>`.
  - Inserts em `audit_logs`.

Sem alteração em RLS, tipos ou tabelas — só código de edge function e uma migration de dados.

Sem testes novos: os helpers de lookup são thin wrappers em torno da query Supabase; a dedup de kudos já é coberta em `dedup_test.ts` e não muda.
