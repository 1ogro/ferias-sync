## Problema
Nos cards de ranking em `/engagement`, o nome + badge do sub_time ocupam a linha e empurram/truncam a pontuação, que fica pouco visível.

## Correção
Em `src/pages/Engagement.tsx` (componente `LeaderboardCard`, linhas 106–114):

- Remover a `<Badge>` de `sub_time` para priorizar nome + pontuação.
- Ajustar o `<li>` com `gap-3` e `min-w-0` na coluna esquerda; aplicar `truncate` no nome para evitar quebra.
- Manter a pontuação (`{r.total_points} pts`) com `shrink-0`, `tabular-nums` e destaque em `text-primary`, garantindo que sempre apareça alinhada à direita.

Sem alterações de dados/lógica — apenas apresentação.