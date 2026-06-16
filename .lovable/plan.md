## Objetivo
Notificar no Slack aniversários de nascimento e de contrato dos colaboradores, com:
- **Digest mensal** (resumo do mês) para gestores diretos e diretores
- **Aviso pontual no dia** para gestor direto + diretores
- **Mensagem de parabéns** no Slack para o próprio aniversariante (apenas nascimento)

Tudo respeitando as preferências em `notification_preferences` (`system_alerts_slack` / `system_alerts_email`).

## O que vai mudar

### 1. Função existente: `send-contract-anniversary-notifications` (digest mensal)
- Hoje envia só para **diretores**. Vai passar a enviar também para **gestores diretos** dos aniversariantes do mês — cada gestor recebe um digest filtrado só com os membros do próprio time que fazem aniversário de contrato no mês.
- Diretores continuam recebendo o digest completo (todos os PJ do mês), como hoje.

### 2. Nova função: `send-birthday-digest` (digest mensal de aniversários de nascimento)
- Roda nos mesmos dias do digest de contrato (01/10/20/30).
- Diretores: digest com todos os aniversariantes do mês.
- Cada gestor: digest com aniversariantes do próprio time no mês.
- Marca cada item como ✅ já passou / ⏳ ainda este mês.
- Auditoria idempotente por dia (mesmo padrão do contrato).

### 3. Nova função: `send-daily-anniversaries` (aviso no dia)
- Roda 1× por dia (manhã, horário SP).
- Para cada colaborador ativo cujo dia/mês de `data_nascimento` ou `data_contrato` é hoje:
  - DM no Slack para o **gestor direto** ("Hoje é aniversário de X" / "Hoje X completa N anos de contrato").
  - DM no Slack para todos os **diretores** ativos.
  - Se for aniversário de nascimento: DM de parabéns para o **próprio colaborador**.
- Respeita `notification_preferences.system_alerts_slack` para cada destinatário.
- Auditoria idempotente por dia + tipo (`daily_birthday` / `daily_contract_anniversary`).

### 4. Agendamentos (pg_cron)
Configurar 2 cron jobs novos (e manter o existente do contrato mensal):
- `send-birthday-digest` — dias 01, 10, 20, 30 de cada mês, 09:00 BRT
- `send-daily-anniversaries` — todos os dias, 09:00 BRT

### 5. Frontend
- `useBirthdayNotifications` (toast in-app) permanece como está — não conflita.
- Sem mudanças visuais; toda a entrega é via Slack.

## Detalhes técnicos

- Reaproveita o helper `findSlackUserId` + `sendSlackDM` já existente em `send-contract-anniversary-notifications`. Extrai para inline em cada função nova (evita import cross-function que o Deno edge não permite limpo).
- Lookup do gestor: `people.gestor_id` → resolve para Slack via email (`users.lookupByEmail`) com fallback por nome.
- Comparação de data em fuso `America/Sao_Paulo` (já tem helper).
- Sem mudanças de schema. Sem novas secrets (usa `SLACK_BOT_TOKEN`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` que já existem).
- `audit_logs` usado para idempotência: chave (`entidade`, `acao`, `entidade_id=YYYY-MM-DD`).

## Fora de escopo
- Email não muda (digest de contrato continua indo por email para diretores; demais novas notificações são **só Slack**, conforme pedido).
- Sem UI nova de preferências — usa as flags `system_alerts_slack` existentes.
