## Diagnóstico

No app web (`GiveKudosDialog` em `src/pages/Engagement.tsx`), o envio para vários colegas está sendo feito num **loop `Promise.allSettled` que chama `kudos-send` N vezes**, cada chamada com 1 destinatário. Isso causa exatamente os dois sintomas relatados:

1. **Canal #time recebe N mensagens** (uma por destinatário) em vez de uma consolidada — porque a lógica de consolidação do `kudos-send` só é acionada quando `validRecipients.length > 1` **dentro da mesma chamada**.
2. **Pontos "não aparecem" no leaderboard** — cada chamada individual dispara sua própria invalidação do React Query e a UI acaba mostrando estado inconsistente/stale entre as N chamadas paralelas; além disso, se qualquer chamada falha silenciosamente (por ex. rate limit ou 500 pontual), aquele destinatário e o `+2` correspondente do remetente somem, dando a impressão de "não computou".

O backend (`kudos-send`) já aceita `to_person_ids: string[]`, valida `GESTOR`/`DIRETOR` + categoria `delivery`, insere N kudos, chama `award_points` para cada destinatário (+10) e para o remetente (+2 × N), e posta **uma única mensagem consolidada** no canal. Ou seja, o fix é apenas no frontend.

O caminho do Slack (`slack-interactions` → `biscoito_submit`) já está correto: uma inserção por destinatário, `awardPoints` por destinatário, e um único card consolidado no canal — não requer mudança.

## Mudança (apenas frontend)

`src/pages/Engagement.tsx` — função `submit` do `GiveKudosDialog`:

- Remover o loop `Promise.allSettled(toIds.map(...))`.
- Fazer **uma única** chamada `mutateAsync({ to_person_ids: toIds, message, category, post_to_channel })` quando `toIds.length > 1`, e manter `to_person_id: toIds[0]` quando `= 1` (para preservar compatibilidade e o caminho single já testado).
- Ler `count` da resposta para o toast: `"Kudos enviado para N colegas 🎉"` (fallback para `toIds.length` se `count` não vier).
- Manter validação client-side de limite (`MAX_MULTI_RECIPIENTS = 10`) e desabilitar botão se exceder.

`src/hooks/useEngagement.ts` — `useSendKudo`:

- Ampliar o tipo do `input` para aceitar `to_person_id?: string` **ou** `to_person_ids?: string[]` (ambos opcionais no tipo, com pelo menos um exigido em runtime). Nenhuma outra mudança — o body já é repassado direto ao `functions.invoke("kudos-send", { body: input })`.

## Fora de escopo

- `kudos-send` (já suporta batch corretamente).
- `slack-interactions` / `slack-slash-biscoito` (fluxo Slack já consolida e pontua corretamente).
- Schema, RLS, `award_points`, `kudos-notify-managers`, leaderboard.

## Verificação após implementação

1. Como GESTOR/DIRETOR no app: selecionar categoria "Entrega", escolher 3 colegas, marcar "Postar em #time" e enviar.
2. Esperado: **1 única** mensagem no canal `#time` listando os 3 nomes, e o leaderboard do mês mostrando `+10` para cada destinatário e `+6` (2×3) para o remetente após refresh.
