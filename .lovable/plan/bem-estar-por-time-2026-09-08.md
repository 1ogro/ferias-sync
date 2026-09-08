# Bem-estar por time

Nova aba "Bem-estar" na tela de Engajamento, para gestores acompanharem semanalmente o humor do time.

## O que o gestor vê

- Cartão de resumo da semana atual: média de check-in (1–5), média de check-out (1–5), total de respostas e participação (respondentes / pessoas que receberam), com variação em relação à semana anterior.
- Tabela "Por time": uma linha por sub-time com média de check-in, média de check-out, respostas, respondentes, destinatários e % de participação na semana selecionada.
- Gráfico de evolução semanal (últimas 4, 8, 12 ou 26 semanas) com uma linha por time (ou linha única quando um time específico é selecionado), escala 1–5.
- Filtros: período (nº de semanas), tipo (check-in, check-out ou os dois) e time.
- Todos os gestores veem todos os times (comparativo completo); quem não é gestor não vê a aba.
- Anonimato: semana/time com menos de 3 respondentes aparece como "dados insuficientes" em vez de média.
- Botão de exportar CSV com os dados filtrados.

## Detalhes técnicos

Banco (nova migração), função `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated`, com verificação de nível de gestão (`is_manager_level` / `is_admin_or_director` / `has_direct_reports`) — caso contrário levanta exceção:

- `get_wellbeing_team_weekly(p_weeks int default 12, p_sub_time text default null)` retornando
  `week_start date, sub_time text, kind text ('checkin' | 'checkout'), avg_value numeric, response_count int, respondent_count int, recipients_count int`.
  - Identifica as pesquisas pelo `pulse_surveys.kind = 'self'` ativas, separando check-in e check-out pelo título/pesquisa já usada em `get_pulse_checkin_averages_v2` (mesma heurística, para manter consistência).
  - Considera apenas perguntas de escala; agrupa por `date_trunc('week', submitted_at)` e `people.sub_time`.
  - `recipients_count` vem de `pulse_run_recipients` dos runs da semana, agrupado pelo `sub_time` da pessoa.
  - Quando `respondent_count < 3`, retorna `avg_value = null`.
- `get_wellbeing_teams()` (ou reaproveitar a lista de `sub_time` de `people` ativos) para popular o seletor de time.

Frontend:

- `src/hooks/useWellbeing.ts`: `useWellbeingTeamWeekly({ weeks, subTime })`, chave de query estável.
- `src/components/pulses/WellbeingTeamPanel.tsx`: filtros, cartões de resumo, tabela por time, gráfico `recharts` (LineChart 1–5) e exportação CSV.
- `src/pages/Engagement.tsx`: nova `TabsTrigger`/`TabsContent` "Bem-estar", renderizada apenas para níveis de gestão (mesma checagem já usada para as demais abas de gestão).

Sem alteração nos disparos ou no template das pesquisas — apenas leitura dos resultados já coletados.
