# Times inativos somem dos gráficos

Hoje os gráficos montam a lista de times a partir do campo de time de cada pessoa, ignorando se o time foi inativado. Por isso CX (3 pessoas ativas), Métricas e Comportamento (1 pessoa) e Pool continuam aparecendo em Engajamento, Bem-estar e Pulses.

## Comportamento novo

- Por padrão, times inativos não aparecem nas tabelas nem nos gráficos de Engajamento, Bem-estar e resultados de Pulses.
- As pessoas ainda vinculadas a um time inativo passam a ser contadas em "Sem time", para os totais continuarem batendo com o total geral.
- Times inativos continuam disponíveis no seletor de time (marcados como "inativo"). Ao escolher um deles, o painel mostra os dados daquele time normalmente.
- Nenhum dado histórico é apagado; muda apenas a forma de agrupar e exibir.

## Onde muda

- Visão geral de Engajamento (cartão "Feedbacks por time")
- Aba Bem-estar (resumo, gráfico semanal, detalhamento e exportação)
- Resultados de Pulses (filtro e gráfico por time)

## Detalhes técnicos

- Nova função auxiliar `public.is_active_team(text)` (STABLE, `search_path=public`): retorna falso quando o nome consta em `teams` com `ativo = false`; nomes fora da tabela seguem considerados ativos.
- `get_engagement_team_summary`: ganha parâmetro `p_include_team text default null`; o `sub_time` de cada pessoa vira `'Sem time'` quando o time está inativo e não é o `p_include_team` selecionado.
- `get_wellbeing_report`: mesma normalização aplicada antes da agregação por time, respeitando `p_sub_time` (time inativo escolhido explicitamente continua sendo agregado). A lista `teams` do retorno passa a excluir inativos, salvo o selecionado.
- `get_pulse_survey_teams`: agrupa com a mesma normalização e deixa de retornar times inativos.
- Frontend: `WellbeingTeamPanel.tsx`, `TeamSummaryCard.tsx` e `PulseResultsPanel.tsx` passam a montar o seletor combinando os times retornados pela RPC com `useTeams(true)`, exibindo os inativos ao final com o sufixo "(inativo)" e enviando o time escolhido para a RPC.
- Sem mudanças de RLS ou de grants; funções continuam `SECURITY DEFINER` com as mesmas checagens de autorização.
