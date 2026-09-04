# Lembrete de coleta de feedback por gestor

Cobrança periódica (padrão: a cada 15 dias, início e meio do mês) para cada gestor registrar feedback dos seus liderados, com repiques quando a coleta continua em aberto.

## O que o gestor recebe

Uma mensagem no Slack (e e-mail, conforme as preferências de cada um) com dois blocos:

- **Nunca avaliados** — liderados que ainda não têm nenhum feedback registrado por aquele gestor.
- **Sem feedback há mais de 45 dias** — liderados cujo último registro do gestor passou do prazo.

A mensagem traz o nome de cada pessoa, a data do último registro (quando existe) e um link direto para a aba de feedbacks por perfil. Se não houver ninguém pendente, o gestor não recebe nada.

## Repiques

Depois da cobrança inicial, se a lista do gestor continuar com pendências, ele recebe um repique após o intervalo configurado (padrão 5 dias) e, se ainda assim nada for registrado, um último aviso — que também é enviado ao diretor/gerente responsável como alerta de coleta parada. Cada gestor recebe no máximo dois repiques por ciclo.

## Configuração (diretoria/admin)

Nova seção em Configurações > Integrações/Notificações com:

- Ligar/desligar a cobrança.
- Cadência do ciclo em dias (padrão 15) — ajustável ao ritmo de sprint do time.
- Dias de tolerância antes do repique (padrão 5) e número máximo de repiques (padrão 2).
- Prazo que define "sem feedback há muito tempo" (padrão 45 dias).
- Horário de envio (padrão 09:00, horário de São Paulo), respeitando janelas de silêncio já existentes.

Cada gestor pode desativar o próprio lembrete nas preferências de notificação.

## Detalhes técnicos

**Banco (migração)**
- Tabela `feedback_reminder_settings` (linha única): `enabled`, `cycle_days` (default 15), `overdue_days` (default 45), `nudge_after_days` (default 5), `max_nudges` (default 2), `send_hour`, `timezone`, `updated_by`, timestamps + trigger de `updated_at`. GRANT `SELECT` para `authenticated`, `ALL` para `service_role`; RLS: leitura para nível de gestão, escrita só para admin/diretor via `is_admin_or_director()`.
- Tabela `feedback_reminder_cycles`: `cycle_start date`, `manager_id`, `pending_never int`, `pending_overdue int`, `nudges_sent int`, `resolved_at`, `last_sent_at`, `escalated_at`, unique (`cycle_start`, `manager_id`). GRANTs equivalentes; RLS de leitura para admin/diretor e para o próprio gestor.
- Coluna `feedback_reminders_slack boolean not null default true` e `feedback_reminders_email boolean not null default true` em `notification_preferences`.
- Função `get_feedback_collection_pending(p_overdue_days int)` (SECURITY DEFINER, `SET search_path = public`): retorna `manager_id, manager_name, manager_email, person_id, person_name, last_feedback_at, bucket ('never'|'overdue')`, montada a partir de `people` (gestor direto e gerente por `sub_time`) com LEFT JOIN em `external_feedbacks` por `author_id`. `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO service_role, authenticated`.

**Edge function `feedback-collection-reminders`** (`verify_jwt = false`)
- Lê as configurações; sai cedo se desligada.
- Calcula o ciclo corrente (dias 1 e 16 por padrão, ou pela cadência configurada) e chama a RPC de pendências.
- Para cada gestor com pendências: cria/atualiza a linha em `feedback_reminder_cycles`, e envia a mensagem via `_shared/notify-helpers.ts` (`notifyRecipient`) respeitando as novas preferências.
- Repique: gestores cuja linha do ciclo tem `resolved_at` nulo e `last_sent_at` mais antigo que `nudge_after_days` recebem novo aviso até `max_nudges`; ao atingir o limite, envia alerta ao gerente/diretor e grava `escalated_at`.
- Marca `resolved_at` quando não restam pendências e registra o resumo em `audit_logs`.

**Agendamento**
- Um único job `pg_cron` diário às 12:00 UTC (09:00 SP) chamando a função via `pg_net`. Roda 1x por dia; a própria função decide se é dia de cobrança ou de repique, então não há polling frequente. O custo é um disparo diário e o atraso máximo de um lembrete é de 24 h.

**Frontend**
- `src/hooks/useFeedbackReminderSettings.ts`: leitura/gravação das configurações e histórico do ciclo atual.
- `src/components/admin/FeedbackReminderSettings.tsx`: formulário de cadência/prazos + botão "Enviar agora (teste)".
- `src/hooks/useNotificationPreferences.tsx` e a tela de preferências ganham os dois novos interruptores.
