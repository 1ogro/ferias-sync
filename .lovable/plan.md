## Por que Pedro e Steffani não aparecem hoje

A tela `/admin/mescladas` lê apenas `pending_people` com `status='MERGED'`. Pedro e Steffani **nunca tiveram** um registro em `pending_people`: eles já estavam em `people`, apenas sem `slack_user_id`. O que aconteceu com eles foi um **backfill de `slack_user_id`** (via `email_pessoal`) — um evento diferente de "merge de pending".

Ou seja: hoje a página lista consolidações de _cadastros pendentes_. O vínculo Slack↔pessoa existente é outro tipo de operação e não está sendo registrado como consolidação.

## Mudanças

### 1. Registrar audit log no backfill

Em `resolveSlackUserIdForPerson` (dentro de `supabase/functions/slack-interactions/index.ts`) e no mesmo helper duplicado dentro de `supabase/functions/kudos-redeliver-dm/index.ts`, quando o `UPDATE people SET slack_user_id = ...` for feito com sucesso, inserir `audit_logs`:

- `entidade = 'people'`
- `entidade_id = person.id`
- `acao = 'SLACK_ID_BACKFILL'`
- `payload = { slack_user_id, matched_email, emails_tried, source: 'notify_recipient_dm' | 'redeliver_dm' }`

### 2. Ampliar a tela `/admin/mescladas` para mostrar os dois tipos

Renomear seção interna para incluir "Vínculos de Slack" além de pending merges. Duas fontes na mesma tabela:

- **Merges de pendentes** (fonte atual): `pending_people WHERE status='MERGED'`.
- **Backfills de Slack ID** (nova fonte): `audit_logs WHERE acao='SLACK_ID_BACKFILL'`, com JOIN em `people` pelo `entidade_id` para pegar nome/email/email_pessoal.

Unificar em uma lista com coluna adicional "Tipo" (`Cadastro pendente` | `Vínculo Slack`). Filtros por email e Slack User ID continuam aplicando aos dois tipos. Ordem: `reviewed_at`/`created_at` desc combinado.

### 3. Backfill retroativo dos 2 casos já resolvidos

Como Pedro e Steffani tiveram o `slack_user_id` gravado hoje sem gerar audit log, inserir 2 linhas em `audit_logs` manualmente (via insert tool) com `acao='SLACK_ID_BACKFILL'`, referenciando `pessoa_013` e `pessoa_023`, para que apareçam na nova visualização. Payload inclui os emails tentados que já vimos no retorno de `kudos-redeliver-dm`.

## Fora de escopo

- Trigger genérico em `people` para gravar audit sempre que `slack_user_id` mudar (poderia ser feito, mas duplica o audit do `audit_people_changes` existente).
- UI para desfazer o vínculo (basta editar `slack_user_id` na tabela).

## Detalhes técnicos

- `audit_logs` já tem RLS que permite leitura por admins; a nova query da tela reaproveita isso.
- A tela passa a fazer 2 queries paralelas (pending_people + audit_logs) e mescla no cliente; volume esperado é baixo.
- Nenhuma migração de schema é necessária.
