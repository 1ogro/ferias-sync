## Objetivo

Permitir escolher a estratégia de pareamento ao criar/editar um pulse do tipo "Avaliação entre pares":

- **Round-robin** (atual): cada pessoa avalia a próxima da lista embaralhada, dentro do mesmo `sub_time`.
- **Aleatório**: cada pessoa recebe um avaliado sorteado aleatoriamente (sem auto-pareamento, sem repetir avaliado na mesma rodada quando possível), dentro do mesmo `sub_time`.
- **Pareamento fixo**: o criador define manualmente pares `avaliador → avaliado` que serão reutilizados em todas as rodadas.

## Mudanças

### 1. Banco de dados (migration)

Adicionar em `pulse_surveys`:

- `peer_pairing_strategy text not null default 'round_robin'` — valores permitidos: `round_robin`, `random`, `fixed` (via CHECK).
- `peer_fixed_pairs jsonb` — array `[{ reviewer_id, subject_id }]`, usado apenas quando `strategy = 'fixed'`.

Sem alteração em RLS, grants ou `peer_review_pairs`.

### 2. Frontend — `src/components/pulses/PulseFormDialog.tsx`

No bloco `kind === "peer"` (após o switch "Revisor anônimo"):

- Novo `Select` "Estratégia de pareamento" com as 3 opções.
- Quando `fixed`: UI para adicionar/remover pares (`avaliador` + `avaliado`) usando dois `Select` com a lista de `people` já carregada, respeitando o escopo (all/teams/custom). Validação: sem auto-pareamento, sem duplicar avaliador.
- Persistir `peer_pairing_strategy` e `peer_fixed_pairs` em criar/editar/duplicar.

Atualizar `src/hooks/usePulses.ts` (`PulseSurvey`, `CreateSurveyInput`, `UpdateSurveyInput`, `useCreatePulseSurvey`, `useUpdatePulseSurvey`, `useDuplicatePulseSurvey`) para incluir os novos campos.

### 3. Edge Function — `supabase/functions/pulse-dispatch/index.ts`

Substituir a chamada única a `generatePeerPairs` por um dispatcher:

```text
switch (survey.peer_pairing_strategy)
  case 'random'      -> generateRandomPairs(group)   // reviewer ≠ subject, embaralha até obter derangement
  case 'fixed'       -> filtra survey.peer_fixed_pairs mantendo apenas pares onde ambos estão em `recipients` ativos
  default            -> generatePeerPairs(group)     // round-robin atual
```

Para `fixed`, ignorar agrupamento por `sub_time` (o criador definiu explicitamente).

### 4. Verificação

- Criar peer pulse `round_robin`, `random` e `fixed`, disparar manualmente e conferir `peer_review_pairs` inseridos e mensagens enviadas.

## Fora de escopo

- Balanceamento avançado (evitar repetir mesmo par entre rodadas históricas).
- Mudanças em kudos/self, notificações, exportação, resultados.
