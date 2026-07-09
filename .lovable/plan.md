## Plano

Ajustar o componente do feed em `/engagement` para que depoimentos de kudos quebrem linha corretamente dentro do box.

## Mudança proposta

- Atualizar o texto do kudo no `KudosFeed` para usar uma combinação mais robusta de CSS:
  - preservar quebras manuais (`\n`);
  - permitir quebra de palavras/URLs longas;
  - impedir overflow horizontal dentro do card/scroll area.

## Detalhes técnicos

- Arquivo alvo: `src/pages/Engagement.tsx`.
- Substituir a classe atual do parágrafo da mensagem por algo equivalente a:
  - `whitespace-pre-wrap`
  - `break-all` ou `overflow-wrap-anywhere` via classe utilitária arbitrária (`[overflow-wrap:anywhere]`)
  - `min-w-0 max-w-full`
- Se o problema estiver vindo do container flex/acima do texto, ajustar também o `li`/container para `min-w-0 max-w-full overflow-hidden`.

## Validação

- Conferir que mensagens com múltiplas linhas aparecem em linhas separadas.
- Conferir que mensagens muito longas/URLs não estouram para fora do feed.