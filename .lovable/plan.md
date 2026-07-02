## Objetivo

Hoje o peer review pareia 1:1 — cada pessoa avalia **um** colega e é avaliada por **um**. Vamos permitir configurar quantas avaliações cada pessoa faz (K), gerando K pares por avaliador. Como a rotação/random é circular, cada pessoa também será avaliada por K colegas diferentes.

## Mudanças no banco (migration)

**`pulse_surveys`**
- `peer_reviews_per_reviewer int NOT NULL DEFAULT 1` (1–5, valida via CHECK).

**`peer_review_pairs`** (hoje só guarda o par + `completed_at`)
- `slack_channel text`, `slack_message_ts text`, `sent_at timestamptz`, `reminders_sent_count int DEFAULT 0`.
- Índice em `(run_id, reviewer_id, subject_id)` único para evitar par duplicado.

**`pulse_responses`**
- `subject_id uuid NULL` referenciando `people`.
- Substituir o `UNIQUE(run_id, question_id, respondent_id)` por `UNIQUE(run_id, question_id, respondent_id, subject_id)` (com `NULLS NOT DISTINCT`) para permitir o mesmo avaliador responder a mesma pergunta sobre múltiplos colegas.

## Geração de pares (`pulse-dispatch`)

- `generateRoundRobinPairs(people, k)`: shuffle inicial e, para cada `offset` em `1..k`, empareia `people[i] → people[(i+offset)%n]`. Garante K subjects distintos por avaliador (com `k ≤ n-1`).
- `generateRandomPairs(people, k)`: repete a derangement K vezes, checando que cada avaliador não recebe o mesmo subject duas vezes.
- `fixed`: já aceita múltiplos pares; passa a agrupar `subject_ids` por reviewer sem sobrescrever.

Trocar `subjectByReviewer: Map<string, Person>` por `Map<string, Person[]>` e, no laço de envio, disparar **uma DM por par** (não uma por pessoa). Cada DM guarda `pair_id` (e `subject_id`) na `metadata` do bloco e nos `action_id` (`pulse_answer:<runId>:<pairId>:<questionId>:<value>`), para que a resposta saiba a qual avaliado se refere.

Atualizar `peer_review_pairs` com `sent_at`, `slack_channel`, `slack_message_ts`. `pulse_run_recipients` continua com 1 linha por avaliador (para reminders/opt-out); adicionamos `pairs_total` e `pairs_completed` para acompanhar progresso.

## Respostas (`slack-interactions`)

- Parser dos `action_id` e `callback_id` passa a extrair `pairId` além de `runId/questionId`.
- `upsert` em `pulse_responses` inclui `subject_id` (buscado do par).
- `completePeerPair` agora recebe `pairId` e marca só aquele par; ao completar todas as perguntas obrigatórias daquele par, dá `award_points` uma vez por par (dedup por `source_id = pair_id`).
- `markRecipientResponded` só marca o recipient como respondido quando **todos** os pares dele estiverem completos (`pairs_completed = pairs_total`).

## Reminders (`pulse-reminders`)

- Filtro passa a considerar pares pendentes (`completed_at IS NULL`) e envia lembrete por par pendente, respeitando `reminder_offsets_hours` e `reminders_sent_count` no próprio par. Preferências de canal/quiet hours continuam vindo do avaliador.

## UI (`PulseFormDialog.tsx` + `usePulses.ts`)

- Quando `kind === "peer"` e estratégia ≠ `fixed`, novo campo numérico "Quantidade de avaliados por pessoa" (1–5), com dica: "Cada pessoa também será avaliada por esse número de colegas".
- Estratégia `fixed`: sem campo de K; a UI já permite múltiplos pares por reviewer (nada a mudar além de deixar de bloquear reviewer repetido).
- Persistir `peer_reviews_per_reviewer` em create/update/duplicate.

## Compatibilidade

- Default `peer_reviews_per_reviewer = 1` preserva o comportamento atual.
- Enquetes já disparadas (runs antigas) continuam funcionando: `pair_id` fica opcional nos handlers; se ausente, cai no fluxo antigo (par único por reviewer).

## Detalhes técnicos

- Limitar K a `min(K_configurado, n-1)` por grupo (`sub_time`) em runtime, com log de diagnóstico quando ajustado.
- `subject_id` em `pulse_responses` fica `NULL` para self-surveys; usar `NULLS NOT DISTINCT` no índice único (Postgres 15+, disponível no Supabase).
- Índice adicional `peer_review_pairs(reviewer_id, completed_at)` já existe — adicionar `(run_id, completed_at)` para o job de lembretes.
- Auditoria: `audit_logs` do dispatch passa a registrar `pairs_created` além de `sent`.

## O que fica fora deste passo

- Auto-atribuição pelo próprio avaliador (escolher quem avaliar via modal). Fica para uma iteração futura.
- Ponderação de pontos por número de pares (mantém 8 pts por par concluído).
