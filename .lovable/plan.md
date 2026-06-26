## Problema

No modal do `/biscoito`:
1. Usuários cadastrados no app aparecem com `[slack only]` — match por email está falhando em alguns casos (provável diferença de case, espaços em branco, ou Slack member sem `profile.email` por escopo).
2. Mesma pessoa aparece duplicada (uma como app user, outra como `[slack only]`) — normalmente quando a pessoa tem mais de uma conta no Slack, ou quando uma das contas não expõe email e cai no fallback slack-only.

## Correção em `supabase/functions/slack-slash-biscoito/index.ts`

Reescrever a montagem do `peopleOptions` com foco em matching robusto por email e deduplicação:

1. **Normalização de email** (helper `normEmail`): `String(x).trim().toLowerCase()`. Aplicar tanto ao indexar `people` quanto ao ler `m.profile.email`.
2. **Index de people por email** continua igual, mas usando `normEmail`. Adicionar segundo index por `slack_user_id` se houver coluna (não existe hoje — pular).
3. **Loop de Slack members**:
   - `email = normEmail(m.profile?.email)`.
   - Se `email && emailToPerson.has(email)` → opção `app:<person_id>` (sem flag).
   - Senão → opção `slack:<slack_user_id>` com sufixo `[slack only]`.
   - Logar `console.log` quando um Slack member sem email cair em slack-only (ajuda a diagnosticar escopo `users:read.email` faltando).
4. **Deduplicação**:
   - `seenPersonIds = new Set<string>()`: ao adicionar uma opção `app:<id>`, pular se já visto. Isso elimina o caso de várias contas Slack do mesmo humano.
   - `seenSlackIds = new Set<string>()`: idem para `slack:<id>` (defensivo; `users.list` não deveria repetir).
   - Garantir que, se um humano tem conta app + conta Slack secundária sem email, a versão `app:` prevalece. Para isso, fazer **duas passadas**:
     - Passada 1: indexar todos os Slack members por email; para cada `email` que bate com `people`, registrar `person_id → preferred slack member` (o que tem email).
     - Passada 2: emitir uma opção `app:<id>` por pessoa do `people` que tenha qualquer Slack member casado (independente da quantidade de contas Slack desse humano).
     - Passada 3: emitir `slack:<id>` apenas para Slack members cujo email **não** casa com nenhum `people` (ou que não têm email e não estão associados a ninguém).
5. **Remoção do próprio sender** continua, agora também removendo qualquer Slack member que case com o mesmo email do sender (caso o sender tenha duas contas Slack).
6. **Ordenação** mantida por nome (pt).

## Validação

- Abrir `/biscoito`: cada pessoa do app aparece **uma única vez**, sem `[slack only]`.
- Apenas Slack members cujo email não está em `people` (ou sem email) aparecem com `[slack only]`.
- Sender não aparece na lista, nem por uma conta Slack alternativa.
- Logs da função mostram quantos Slack members ficaram sem email (para decidir se precisamos pedir escopo `users:read.email`).

## Fora de escopo

- Mudanças na função `slack-interactions` (resolução de recipient não muda — `app:<id>` e `slack:<id>` continuam tratados como antes).
- Schema, RPCs, frontend.
