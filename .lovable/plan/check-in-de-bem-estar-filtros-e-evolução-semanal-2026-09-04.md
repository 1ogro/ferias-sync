# Check-in de bem-estar: filtros e evolução semanal

## Objetivo
Na pesquisa de check-in (autoavaliação 1–5), permitir filtrar os resultados e acompanhar a evolução semanal do humor do time, sem quebrar o anonimato.

## O que muda para quem usa
- No painel de resultados da pesquisa, um bloco novo "Evolução semanal" com:
  - gráfico de linha com a média semanal (1–5) das últimas 4, 8, 12 ou 26 semanas;
  - número de respostas por semana e variação em relação à semana anterior (setinha para cima/baixo);
  - destaque quando a média cai abaixo de um limite (padrão 3,0).
- Filtros acima do gráfico e das tabelas de médias:
  - período (últimas N semanas);
  - time (sub-time) — apenas para quem já tem permissão de ver mais de um time;
  - pergunta (quando a pesquisa tem mais de uma pergunta de escala);
  - somente respostas com comentário (opcional).
- Proteção de anonimato: se um filtro resultar em menos de 3 respostas na semana, o ponto aparece como "dados insuficientes" em vez do valor.
- Os filtros também valem para a exportação CSV/Excel do painel.

## Detalhes técnicos
Banco (nova migração):
- `get_pulse_weekly_trend(p_survey_id uuid, p_weeks int default 12, p_sub_time text default null, p_question_id uuid default null)` retornando `week_start date, avg_value numeric, response_count int, respondent_count int`.
  - Mesma checagem de autorização de `get_pulse_responses_safe` (admin/diretor, gerente, ou criador da pesquisa) e o mesmo filtro que oculta respostas de DIRETOR/GERENTE para gerentes que não criaram a pesquisa.
  - Agrupa por `date_trunc('week', submitted_at)`; junta `people.sub_time` só para filtrar (não retorna identificação).
  - Quando `respondent_count < 3`, retorna `avg_value = null` (k-anonimato).
  - `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;`.
- `get_pulse_survey_teams(p_survey_id uuid)` retornando os `sub_time` distintos com respostas, com a mesma autorização, para popular o seletor de time.

Frontend:
- `src/hooks/usePulses.ts`: hooks `usePulseWeeklyTrend(surveyId, { weeks, subTime, questionId })` e `usePulseSurveyTeams(surveyId)`, com query keys estáveis.
- Novo `src/components/pulses/PulseTrendPanel.tsx`: barra de filtros + gráfico `recharts` (LineChart, domínio 1–5) + resumo de variação semanal.
- `src/components/pulses/PulseResultsPanel.tsx`: renderiza o painel de evolução para pesquisas `kind = "self"` com pelo menos uma pergunta de escala; aplica os mesmos filtros às tabelas de médias e à lista de respostas recentes.
- Exportação passa os filtros ativos.

Sem alteração no template da pesquisa em si — o check-in continua sendo criado do mesmo jeito; o que ganha filtro e evolução é a leitura dos resultados.
