## Objetivo
Diretores continuam acumulando pontos (kudos, pulses, etc.), mas não aparecem no ranking de engajamento.

## Mudança
Atualizar a função `public.get_engagement_leaderboard` para filtrar `papel <> 'DIRETOR'` (mantendo os demais critérios de escopo). A tabela `engagement_points` continua registrando pontos normalmente — nenhuma alteração em `award_points`, `kudos-send`, `pulse-response-notify` ou UI de "Meus Pontos".

## SQL (migração)
```sql
CREATE OR REPLACE FUNCTION public.get_engagement_leaderboard(...)
-- adicionar cláusula:  AND COALESCE(pe.papel, '') <> 'DIRETOR'
```
Mantém `SECURITY DEFINER`, assinatura e demais regras (scope team/global, período).

## Fora do escopo
- Não altera `EngagementSummaryCard` nem `useLeaderboard` (mesmo contrato).
- Não remove pontos históricos de diretores.
- Ranking pessoal (`useMyPoints`) segue funcionando para diretores.