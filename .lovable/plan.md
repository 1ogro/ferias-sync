# Desligar a cobrança de feedback passa a exigir aprovação

Hoje qualquer gestor pode desligar sozinho os avisos de "Cobrança de coleta de feedback" nas preferências de notificação. Isso muda: o gestor pode pedir o desligamento, mas quem decide é seu gerente, a diretoria ou um admin, seguindo as mesmas regras de escalonamento já usadas para alterações de dados.

## O que muda para o gestor

- Os dois interruptores de "Cobrança de coleta de feedback" (Slack e e-mail) ficam bloqueados para quem tem time (gestor/gerente).
- No lugar, aparece um botão "Solicitar desligamento", que abre um campo obrigatório de justificativa (mínimo 5 caracteres) e o canal desejado (Slack, e-mail ou ambos).
- Enquanto o pedido estiver em análise, os interruptores mostram o aviso "Pedido em análise" e o gestor pode cancelar o próprio pedido.
- Se aprovado, os avisos são desligados automaticamente; se recusado, tudo continua ligado e o gestor vê o motivo.
- Quem não tem liderados continua ajustando os próprios avisos livremente (eles nem recebem essa cobrança).

## Quem aprova

Mesma escada já usada no sistema: o gerente do time do solicitante quando existe; na falta dele, diretoria/admin. Diretores e admins sempre podem decidir. O pedido aparece na Caixa de Entrada junto com as demais solicitações de alteração de dados.

## Detalhes técnicos

**Banco (migração)**
- Aceitar novo `kind = 'feedback_reminder_optout'` em `data_change_requests`, com `changes` no formato `{"feedback_reminders_slack": false, "feedback_reminders_email": false}` (canais escolhidos).
- `request_data_change`: permitir que o solicitante crie esse tipo para si mesmo (`person_id = requested_by = current_person_id()`), bloqueando duplicatas em status `PENDENTE`.
- `review_data_change`: ao aprovar um pedido desse tipo, aplicar os campos em `notification_preferences` do `person_id` (upsert), em vez do caminho de dados contratuais. Reaproveitar `can_review_data_change` para o escalonamento (gerente do `sub_time`, senão `is_admin_or_director()`).
- Nova RLS/coluna não é necessária; `notification_preferences` continua editável pelo dono, então adicionar checagem em trigger `BEFORE UPDATE` que impede o próprio gestor (pessoa com liderados ativos) de setar `feedback_reminders_slack/email = false` diretamente — a mudança só passa quando feita pela função SECURITY DEFINER de aprovação.
- Função auxiliar `public.has_direct_reports(_person_id text)` (STABLE, SECURITY DEFINER, `SET search_path = public`) usada pelo trigger e pelo frontend via RPC.

**Frontend**
- `src/hooks/useNotificationPreferences.tsx`: expor `canToggleFeedbackReminders` (via `has_direct_reports`) e bloquear a gravação local desses dois campos quando falso.
- Novo `src/components/settings/FeedbackReminderOptOutDialog.tsx`: justificativa + escolha de canais, chamando `request_data_change`.
- `src/pages/Settings.tsx`: switches desabilitados com badge de estado (bloqueado / em análise), botão de solicitação e cancelamento (`cancel_data_change`).
- `src/pages/Inbox.tsx`: rótulo e resumo legível para o novo `kind` na lista de solicitações de alteração.
