## Objetivo
No dia 1 do mês, a função `engagement-monthly-report` envia sempre um resumo mensal do mês anterior. Vamos ajustar para que, quando esse dia 1 marcar o fim de um trimestre ou de um ano, a notificação seja consolidada nesse período (trimestre ou ano) e o resumo mensal seja **suprimido**.

Regra final (executada dia 1 às 9h, como hoje):
- Se o mês recém-encerrado foi **dezembro** → enviar **Resumo anual** do ano encerrado. Suprimir mensal e trimestral.
- Senão, se foi **março, junho ou setembro** → enviar **Resumo trimestral** do trimestre encerrado. Suprimir mensal.
- Caso contrário → enviar **Resumo mensal** (comportamento atual).

## Mudanças

### `supabase/functions/engagement-monthly-report/index.ts`
- Substituir `monthRange()` por `resolvePeriod()` que retorna `{ start, end, label, kind: 'month' | 'quarter' | 'year', auditId }` com base no mês corrente (ou parâmetro `?period=month|quarter|year` para forçar em testes/dry-run).
  - `month`: mês anterior (comportamento atual).
  - `quarter`: início e fim do trimestre recém-encerrado (ex.: rodando em 1º/abril → 1º/jan a 1º/abril).
  - `year`: início e fim do ano recém-encerrado.
- Ajustar `buildReportBlocks` para usar título dinâmico: "Resumo mensal", "Resumo trimestral" ou "Resumo anual" (para time e visão global), com o `label` do período correspondente.
- Ajustar mensagem fallback (`text`) do Slack e o registro em `audit_logs` (`acao`: `MONTHLY_ENGAGEMENT` | `QUARTERLY_ENGAGEMENT` | `ANNUAL_ENGAGEMENT`; `entidade_id` com o período apropriado — `YYYY-MM`, `YYYY-Qn`, `YYYY`).
- Query param opcional `?period=` para forçar tipo em execuções manuais/dry-run; sem parâmetro, aplica a regra automática acima.

## Fora de escopo
- Nenhuma mudança no agendamento do pg_cron: continua rodando todo dia 1 às 9h; a própria função decide o tipo de resumo.
- Layout dos blocos Slack permanece igual (mesmos campos e tops), só muda título e período.
- Nenhuma alteração no app web.