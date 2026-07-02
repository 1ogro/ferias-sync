# Lembretes automáticos no Slack para cadastros incompletos

## Objetivo

Enviar lembretes automáticos via Slack para:

1. Usuários com cadastro incompleto — priorizando campos críticos para autenticação e continuidade contratual (email, telefone, datas de contrato).
2. Todos os cadastros incompletos ainda pendentes antes do fim de cada mês (varredura final).

## O que classifica como "cadastro incompleto"

**A. `pending_people` com `status = 'PENDENTE'**`

- Cadastro submetido mas ainda não aprovado. Lembrete vai para o gestor (`gestor_id`) e/ou o admin, cobrando a aprovação.
- Campos críticos ausentes (email, telefone, data de admissão, tipo de contrato) são destacados na mensagem.

**B. `people` ativos com campos essenciais em branco**

- Sem `email` corporativo → bloqueia login/auth.
- Sem `slack_user_id` (nem resolvível por email) → bloqueia notificações.
- Sem `data_admissao` ou (para PJ/CLT temporário) sem `data_fim_contrato` → impacta férias, aniversário de contrato e renovações.
- Sem `telefone` (opcional, apenas cita, não bloqueia).

Lembrete vai por DM ao próprio colaborador (quando o Slack ID é conhecido) **e** ao gestor.

## Nova Edge Function: `send-registration-reminders`

Arquivo: `supabase/functions/send-registration-reminders/index.ts`

Parâmetros de invocação (body JSON):

- `mode`: `"weekly"` (padrão, roda semanalmente) ou `"month_end"` (roda no penúltimo dia útil do mês, mensagem mais enfática).
- `dry_run`: booleano opcional para preview sem enviar.

Fluxo:

1. Consulta `pending_people` PENDENTE há > 2 dias (weekly) ou qualquer PENDENTE (month_end). Agrupa por `gestor_id`.
2. Consulta `people` ativos com campos críticos ausentes.
3. Para cada destinatário resolve Slack ID via `slack_user_id` ou `resolveSlackUserId` (email/nome) usando helper existente em `_shared/notify-helpers.ts`.
4. Monta blocos Slack: título por perfil (auto vs gestor), lista os itens faltantes com ícones (🔴 crítico auth, 🟠 contrato, 🟡 opcional), botão/link para o cadastro no app.
5. Envia via `slack-notification` (fire-and-forget) e grava linha em `audit_logs` (`action = 'REGISTRATION_REMINDER_SENT'`, com `mode`, contagem, destinatários) — padrão async assíncrono já usado no projeto.
6. Respeita `notification_preferences` do usuário (canal `slack` habilitado para categoria de cadastro).

## Preferências de notificação

Reaproveita `notification_preferences`. Se ainda não existir chave, adiciona:

- `slack_registration_reminders` (default `true`) — campo booleano em `notification_preferences`.

Migração adiciona a coluna com default `true` e faz backfill.

## Agendamento (pg_cron + pg_net)

Duas cron jobs (usar `supabase--insert` para SQL com URL/anon key do projeto):

- `registration-reminders-weekly` — toda segunda 09:00 BRT (`0 12 * * 1`), body `{"mode":"weekly"}`.
- `registration-reminders-month-end` — dia 28 de cada mês 10:00 BRT (`0 13 28 * *`), body `{"mode":"month_end"}`. A function verifica internamente se está a ≤ 3 dias do fim do mês para efetivamente enviar (cobre fevereiro).

## Auditoria e integridade

- Toda execução grava `audit_logs` com resumo (`{mode, pending_reminded, people_reminded, dry_run}`).
- Falhas por destinatário logadas mas não interrompem o batch.
- Deduplicação: não reenviar ao mesmo destinatário se já houve `REGISTRATION_REMINDER_SENT` para ele nos últimos 6 dias (weekly) — month_end sempre envia.

## Arquivos

Novos:

- `supabase/functions/send-registration-reminders/index.ts`
- `supabase/migrations/<timestamp>_registration_reminders.sql` — coluna `slack_registration_reminders` em `notification_preferences` + índice auxiliar em `audit_logs (action, created_at)` se ainda não existir.

Edições:

- `src/components/settings/NotificationPreferencesSection.tsx` (ou equivalente) — novo toggle.
- Cron jobs via `supabase--insert` (não migration, contém URL/anon key).

## Fora de escopo

- Redesenho do fluxo de aprovação de `pending_people`.
- Envio por email (apenas Slack, conforme solicitado).