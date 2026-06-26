Atualizar o modal do comando `/biscoito` no Slack para remover a flag `[slack only]` dos nomes e ajustar o disclaimer, mantendo todo o funcionamento existente.

## O que mudar

Arquivo: `supabase/functions/slack-slash-biscoito/index.ts`

### 1. Remover a flag `[slack only]` do texto das opções

Na construção das opções do `static_select`, o código atual faz:

```ts
opts.push({ text: `${name} [slack only]`, value: `slack:${m.id}`, sortKey: name.toLowerCase() });
```

Alterar para:

```ts
opts.push({ text: name, value: `slack:${m.id}`, sortKey: name.toLowerCase() });
```

Os `value` continuam sendo `slack:${m.id}` para colegas não cadastrados, então a lógica de salvamento do biscoito (via `slack-interactions` ou `kudos-send`) não é afetada.

### 2. Atualizar o disclaimer do modal

Trocar o texto do bloco `context` de:

> Colegas com [slack only] ainda não têm conta no app — o biscoito é registrado e os pontos entram no painel assim que o cadastro for aprovado.

Para:

> Alguns colegas podem ainda não ter conta no app. O biscoito será registrado e pontuado, assim que seu cadastro for aprovado.

## O que não muda

- A deduplicação por `seenPersonIds` e `seenSlackIds` permanece.
- A lógica de match por email e nome contra a tabela `people` permanece.
- A contagem de diagnóstico (`matchedByEmail`, `matchedByName`, `slackOnly`, `noEmailCount`) permanece, já que é apenas logging interno.
- O valor `slack:${m.id}` continua sendo enviado para membros não cadastrados, preservando o funcionamento do fluxo de registro de biscoito.

## Validação

- Verificar via `supabase--test_edge_functions` ou `supabase--curl_edge_functions` que a função `slack-slash-biscoito` responde sem erros.
- Confirmar no log que o modal continua sendo aberto (`views.open` ok) e que os contadores de diagnóstico ainda são impressos.

## Resumo

Esconde a distinção visual entre usuários cadastrados e não cadastrados no modal, mantendo a mesma lógica de backend e pontuação.