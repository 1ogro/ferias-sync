## Objetivo
Notificar diretores (e-mail + Slack) sobre aniversários de contrato de colaboradores PJ ativos.

## Definição
- Aniversário de contrato = mesmo dia/mês de `people.data_contrato`, considerando apenas `modelo_contrato = 'PJ'` e `ativo = true`.
- Notificação enviada no próprio dia do aniversário, uma vez por dia, agrupando todos os colaboradores que façam aniversário naquele dia.
- Destinatários: todos com `papel = 'DIRETOR'` e `ativo = true`.
- Respeita `notification_preferences` de cada diretor (envia por e-mail e/ou Slack conforme preferência).

## Implementação

### 1. Nova Edge Function: `send-contract-anniversary-notifications`
- Sem JWT (chamada por cron).
- Busca PJs ativos cujo `data_contrato` tem dia/mês igual a hoje (timezone America/Sao_Paulo).
- Para cada um calcula anos completos de contrato.
- Busca diretores ativos + preferências de notificação.
- Para cada diretor envia:
  - **E-mail** via Resend, com a lista (nome, cargo, anos completos, data original).
  - **Slack** via `slack-notification` (DM ao diretor, fallback por email/nome conforme padrão existente).
- Loga execução em `audit_logs` (`entidade='contract_anniversary'`).
- Idempotência: usa tabela de controle ou checa `audit_logs` do dia para evitar reenvio.

### 2. Migração SQL
- Agendar cron diário (ex.: 09:00 BRT = 12:00 UTC):
  ```
  select cron.schedule(
    'contract-anniversary-daily',
    '0 12 * * *',
    $$ select net.http_post(
        url := '.../functions/v1/send-contract-anniversary-notifications',
        headers := '{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
        body := '{}'::jsonb
    ); $$
  );
  ```
- Inserido via insert-tool (não migration), pois inclui URL/anon key.

### 3. Configuração
- Adicionar `send-contract-anniversary-notifications` em `supabase/config.toml` com `verify_jwt = false`.
- Reusa secrets existentes: `RESEND_API_KEY`, `SLACK_BOT_TOKEN`.

### 4. Teste manual
- Endpoint aceita body opcional `{ "date": "YYYY-MM-DD", "dry_run": true }` para validação sem enviar.

## Arquivos
- `supabase/functions/send-contract-anniversary-notifications/index.ts` (novo)
- `supabase/config.toml` (adicionar entry)
- Nova migração para cron (via insert SQL)

## Fora de escopo
- UI de preferência específica para esse tipo (usa preferências gerais de notificação existentes).
- Notificação para o próprio colaborador.