## Objetivo
Classificar votos de pulse como check-in ou check-out pelo **dia da semana da resposta** (em horário de São Paulo), ignorando o título do pulse — porque colaboradores respondem qualquer pulse recebido no Slack sem se importar se é o do dia.

## Regra de classificação
Baseada em `pulse_responses.submitted_at` convertido para `America/Sao_Paulo`:

- **Check-in**: Segunda, Terça, Quarta, Quinta
- **Check-out**: Sexta, Sábado, Domingo

(Segunda conta como check-in — início da semana, conforme resposta do usuário.)

## Mudança

Reescrever a função `public.get_pulse_checkin_averages()` para substituir a classificação por título (`ILIKE '%check-in%'`) pela classificação por dia da semana em fuso local:

```sql
CASE EXTRACT(dow FROM (resp.submitted_at AT TIME ZONE 'America/Sao_Paulo'))
  WHEN 1 THEN 'in'  -- seg
  WHEN 2 THEN 'in'  -- ter
  WHEN 3 THEN 'in'  -- qua
  WHEN 4 THEN 'in'  -- qui
  WHEN 5 THEN 'out' -- sex
  WHEN 6 THEN 'out' -- sáb
  WHEN 0 THEN 'out' -- dom
END AS bucket
```

Mantém tudo o mais igual: janela de 30 dias, filtro `question_type = 'scale_1_5'`, guard de admin/gestor/diretor, grants.

## Detalhes técnicos
- Migração única `CREATE OR REPLACE FUNCTION public.get_pulse_checkin_averages()`.
- Nenhuma mudança no frontend — `usePulseCheckinAverages` e `EngagementSummaryCard` continuam consumindo os mesmos campos.
- Efeito é retroativo: as médias mostradas passam a refletir a nova regra imediatamente, inclusive para respostas antigas.
- Não altera a coleta ou o armazenamento de respostas — só a agregação exibida.
