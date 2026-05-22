## Mudança
Substituir o envio diário no dia exato pelo envio mensal recorrente (dias 01, 10, 20 e 30), listando todos os aniversários de contrato do mês corrente.

## Ajustes

### 1. Edge Function `send-contract-anniversary-notifications`
- Trocar filtro de "dia + mês = hoje" para "mês de `data_contrato` = mês atual" (PJ ativos).
- Ordenar a lista por dia do aniversário (asc).
- Para cada item, calcular anos completos ao atingir o aniversário neste mês.
- Marcar visualmente os itens já passados/futuros do mês (ex.: ✅ já feito / ⏳ a fazer) para ajudar o diretor.
- Texto do e-mail/Slack: "Aniversários de contrato PJ — {mês/ano}" com a lista completa do mês.
- Idempotência: usar `entidade_id = YYYY-MM-DD` (data do disparo) em `audit_logs` para não duplicar envio no mesmo dia, permitindo múltiplos disparos no mês.
- Manter `dry_run` e `date` override.

### 2. Cron
- Remover o job atual `contract-anniversary-daily`.
- Criar novo job `contract-anniversary-monthly-checkpoints` com expressão `0 12 1,10,20,30 * *` (12:00 UTC = 09:00 BRT nos dias 01, 10, 20 e 30).
- Aplicado via insert SQL (URL + anon key).

## Fora de escopo
- Mudanças de UI ou de preferências de notificação.
- Notificação para o próprio colaborador.

## Arquivos
- `supabase/functions/send-contract-anniversary-notifications/index.ts` (atualizado)
- SQL para `cron.unschedule` do job antigo e `cron.schedule` do novo