## Objetivo
Adicionar dois novos cards de ranking no painel de Engajamento (`/engagement`): **Ranking do trimestre** e **Ranking do ano**, visíveis somente para usuários com papel `DIRETOR`.

## Mudanças

### 1. Banco (migration)
Atualizar `public.get_engagement_leaderboard(p_scope, p_period)` para aceitar novos valores em `p_period`:
- `month` (mês corrente — já existe)
- `quarter` (trimestre corrente — novo, via `date_trunc('quarter', now())`)
- `year` (ano corrente — novo, via `date_trunc('year', now())`)
- `all` (mantido)

O restante da função (escopo `team`/`global`, filtros de visibilidade, limite 50) permanece igual.

### 2. Hook `src/hooks/useEngagement.ts`
- Ampliar o tipo do parâmetro `period` do `useLeaderboard` para `"month" | "quarter" | "year" | "all"`.

### 3. Página `src/pages/Engagement.tsx`
- Detectar se o usuário é Diretor via `useAuth()` (`person?.papel === 'DIRETOR'`).
- Renderizar, apenas para Diretores, dois novos cards logo abaixo do ranking mensal existente:
  - **Ranking do trimestre** — reutiliza o mesmo componente visual do `LeaderboardCard`, com toggle Meu time / Global, mas fixando `period="quarter"` e título/descrição adequados.
  - **Ranking do ano** — idem, com `period="year"`.
- Refatorar `LeaderboardCard` para receber `period` e textos (título/descrição) como props, evitando duplicação.
- Layout: em telas grandes, empilhar os três rankings (mês, trimestre, ano) na coluna central do grid atual, mantendo o card de Feed de kudos na terceira coluna.

## Fora de escopo
- Nenhuma mudança no card de resumo da Home nem em outros papéis (gestor continua vendo apenas o ranking mensal).
- Nenhum recorte por período customizado (datas arbitrárias).