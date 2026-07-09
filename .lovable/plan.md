## Objetivo
Fazer com que as mensagens dos kudos exibidas no feed de `/engagement` respeitem as quebras de linha digitadas pelo remetente, em vez de colapsarem tudo em uma única linha.

## Onde está o problema
No componente `KudosFeed` (dentro de `src/pages/Engagement.tsx`), a mensagem é renderizada assim:

```tsx
<p className="text-sm">{k.message}</p>
```

O HTML colapsa whitespace por padrão, então quebras de linha (`\n`) do usuário desaparecem na interface.

## Alteração proposta
Trocar a classe da mensagem para preservar quebras de linha e evitar estouro horizontal:

```tsx
<p className="text-sm whitespace-pre-wrap break-words">{k.message}</p>
```

- `whitespace-pre-wrap`: preserva `\n` e espaços, mas ainda quebra automaticamente quando a linha é longa.
- `break-words`: evita que palavras muito longas (URLs, por exemplo) estourem o card.

## Escopo
- Apenas o feed de kudos em `src/pages/Engagement.tsx`.
- O card resumo de engajamento (`EngagementSummaryCard.tsx`) **não** será alterado, pois o usuário pediu especificamente `/engagement`.

## Validação
Após a mudança, kudos com mensagens de várias linhas devem aparecer no feed com as linhas separadas conforme digitado.