## Diagnóstico

O kudos "triplicado" da Isabela → Denilda são de fato **3 registros distintos** no banco (`fa5b65ad…` 00:05:51, `116839a4…` 00:05:59, `f7ae3dc5…` 00:06:12), todos vindos do modal web (`slack_channel_posted = null`). O padrão se repete com o par de 02/07 15:52 (Isabela → Denilda, categoria `delivery`).

Não é bug de loop: cada mutação completou e o diálogo fechou. O que aconteceu foi reabertura manual do modal — mas o backend `kudos-send` **não valida duplicatas**, então aceita qualquer reenvio, inclusive contabiliza pontos várias vezes (`award_points` com `source_id` diferente por kudo).

## Plano

### 1. Limpar duplicatas existentes (migration)
- Manter o kudos mais antigo por grupo `(from_person_id, to_person_id, message, category)` quando criados dentro de uma janela curta (≤ 5 min).
- Antes de deletar, remover as linhas de `engagement_points` associadas via `source_id` dos kudos duplicados, para não deixar pontos órfãos e ajustar o leaderboard.
- Registrar em `audit_logs` (`entidade='kudos'`, `acao='DEDUP_CLEANUP'`) os IDs removidos e beneficiários afetados.

Casos específicos a remover:
- `116839a4-9a34-4439-826c-717cbb14661b` e `f7ae3dc5-9dda-48ea-8ab8-0acafddbf38e` (mantém `fa5b65ad…`)
- `285da4ab-dd01-4eff-8330-23f7db539f74` (mantém `c5780d0c…`)

### 2. Prevenir novas duplicatas no `kudos-send`
No edge function, antes do `insert`:
- Buscar kudos do mesmo `from_person_id` para o mesmo `to_person_id`, com mesma `category` e mesma `message` (após `trim`), criados nos últimos **60 segundos**.
- Se existir, retornar `200` com `{ ok: true, deduped: true, kudo: <existente>, count: 0 }` e **não** inserir nem chamar `award_points` nem repostar no Slack.
- Para envios multi-destinatário, aplicar a verificação por destinatário individualmente (alguns podem passar, outros serem deduplicados).

Janela de 60s é curta o suficiente para não bloquear reconhecimentos legítimos repetidos ao longo do dia, e suficiente para conter re-cliques/reaberturas do modal.

### 3. Feedback melhor no frontend (`src/pages/Engagement.tsx`)
- Quando a resposta vier com `deduped: true`, mostrar toast `"Este kudos já foi enviado há instantes 👍"` em vez do toast de sucesso normal, para o remetente entender que a ação anterior já tinha funcionado.
- Manter o fechamento do diálogo e limpeza do formulário.

### 4. Testes
Adicionar testes em `supabase/functions/send-registration-reminders/lib_test.ts`… não — os testes de kudos ficam em novo arquivo `supabase/functions/kudos-send/dedup_test.ts` cobrindo a função pura de dedup (extraída para `lib.ts` do módulo `kudos-send`):
- Mesma mensagem/categoria/destinatário dentro da janela → deduplicado.
- Mesma mensagem mas categoria diferente → passa.
- Mensagem com trim diferente (espaços) → deduplicado.
- Janela expirada (>60s) → passa.

## Detalhes técnicos

Arquivos afetados:
- `supabase/migrations/<timestamp>_dedup_kudos_cleanup.sql` — limpeza + audit log.
- `supabase/functions/kudos-send/index.ts` — chamada de verificação antes do insert.
- `supabase/functions/kudos-send/lib.ts` (novo) — helper `findRecentDuplicate` e função pura de comparação.
- `supabase/functions/kudos-send/dedup_test.ts` (novo) — testes unitários.
- `src/pages/Engagement.tsx` — tratamento do `deduped: true`.

Não vou adicionar índice único no banco: a categoria e o texto podem se repetir legitimamente semanas depois; a proteção por janela temporal no edge function é mais adequada e reversível.
