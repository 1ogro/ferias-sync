# Corrigir espaços virando "+" nas mensagens de kudos enviadas pelo Slack

## Diagnóstico

Em `supabase/functions/slack-interactions/index.ts` (linha 304), o corpo `application/x-www-form-urlencoded` que o Slack envia é decodificado assim:

```ts
const payload = JSON.parse(decodeURIComponent(body.replace("payload=", "")));
```

No padrão form-urlencoded, espaços são codificados como `+`. O `decodeURIComponent` **não** converte `+` em espaço — ele só trata sequências `%xx`. Resultado: todo texto vindo de um `view_submission` (mensagem do modal `/biscoito`, modal de kudos do pulse, texto livre do pulse) chega com `+` em vez de espaço, e esse valor é persistido em `kudos.message` e ecoado nos posts/DMs do Slack.

Esse é o único ponto afetado: `kudos-send` (kudos pela UI web) já usa JSON puro e não tem o problema.

## Mudança

Substituir o parse manual por `URLSearchParams`, que decodifica corretamente o `+` como espaço:

```ts
const params = new URLSearchParams(body);
const payload = JSON.parse(params.get("payload") || "{}");
```

Arquivo afetado:
- `supabase/functions/slack-interactions/index.ts` — apenas o trecho de parse do payload (linha ~304).

## Escopo

- Não toca em `slack-slash-biscoito`, `kudos-send`, `kudos-notify-managers` ou no frontend.
- Não há migração: mensagens já gravadas com `+` permanecem como estão (posso opcionalmente rodar um `UPDATE` para sanitizar histórico — fora deste plano por padrão; me avise se quiser incluir).

## Validação

- Após o deploy automático da edge function, enviar um `/biscoito` ou kudo via pulse com uma mensagem contendo espaços e confirmar que o card postado no canal e o registro em `kudos.message` aparecem com espaços normais.
