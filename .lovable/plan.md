
## Objetivo

Toda notificação de **reset de senha** e de **validação de novos cadastros** deve sair simultaneamente por **email e Slack DM** (redundantes, não excludentes). Quando o destinatário não tiver um usuário Slack vinculado ao email pessoal, o sistema avisa para procurar o administrador — sem falhar silenciosamente.

## Diagnóstico do estado atual

| Fluxo | Email | Slack DM | Aviso se sem Slack |
|---|---|---|---|
| Reset de senha (`send-password-reset-slack`) | ✅ enviado em paralelo | ✅ enviado se lookup achar | ❌ apenas retorna `dm_status: failed`, UI não mostra nada |
| Novo cadastro pendente → admins (`NewCollaboratorForm`, `PendingCollaboratorsList`) | ✅ `send-notification-email` (um email agregado) | ⚠️ `slack-notification` posta em **canal**, não DM por admin | ❌ sem verificação por admin |
| Aprovação → colaborador (`notify-approved-collaborator`) | ✅ Resend + invite | ✅ DM se `lookupByEmail` achar | ❌ email não menciona o problema quando Slack falha |

## Mudanças

### 1. `supabase/functions/send-password-reset-slack/index.ts`
- Sempre tentar email primeiro, mesmo quando o Slack lookup falha (hoje quando `slackUserId` não é encontrado a função retorna antes de gerar link/email). Mover a geração do `recoveryLink` e o `sendRecoveryEmail` para antes do early-return.
- Quando `slackUserId` for `null`, retornar `{ ok: true, dm_status: "no_slack_linked", email_status, ...}` em vez de `dm_error: "slack_user_not_found"`.
- Manter aviso no canal admin já existente.

### 2. `src/pages/Auth.tsx` (tela de "esqueci minha senha")
- Ler `dm_status` da resposta. Se `no_slack_linked`, exibir toast/alert:  
  _"Enviamos o link por email. Não encontramos seu usuário no Slack vinculado a este email — se precisar receber também por DM, procure um administrador."_
- Se `email_status === "failed"` e sem Slack, mostrar erro pedindo contato com admin.

### 3. `supabase/functions/notify-approved-collaborator/index.ts`
- Quando não houver `slackId`, incluir no HTML do email um bloco:  
  _"Não conseguimos localizar seu usuário no Slack. Para receber notificações por DM, peça a um administrador para vincular seu Slack."_
- Já envia ambos os canais; apenas anexa o aviso.

### 4. Notificação de novo cadastro pendente para admins/diretores
Trocar a chamada única `slack-notification` (canal) por **DM individual redundante ao email** para cada admin/diretor:
- Criar helper reutilizável `supabase/functions/_shared/notify-admins.ts` que:
  1. Busca `people` com `is_admin = true` ou papel director/admin ativos.
  2. Para cada admin: envia email (Resend) **e** DM Slack via `lookupByEmail`.
  3. Retorna lista `{ person_id, email_ok, dm_ok, slack_linked }`.
- `send-notification-email` (type `NEW_PENDING_PERSON`) e `slack-notification` (type `NEW_PENDING_PERSON`) passam a delegar para esse helper — ou é criada nova função `notify-admins-pending` chamada pelo front, substituindo as duas chamadas em `NewCollaboratorForm.tsx` e `PendingCollaboratorsList.tsx`.
- Persistir em `audit_logs` (ação `NOTIFY_ADMINS_PENDING`) o resultado por admin, para permitir que outro admin veja quais colegas não têm Slack vinculado.

### 5. UI de gestão
- Em `Admin.tsx` (ou banner no dashboard admin), mostrar aviso quando existe log recente `NOTIFY_ADMINS_PENDING` com `slack_linked=false` para o próprio usuário: _"Seu Slack não está vinculado ao email X — você só recebe alertas por email."_

## Fora de escopo
- Não altera regras de aprovação nem cria novas tabelas.
- Não muda templates visuais do email além do bloco de aviso.
- Não mexe em outros fluxos (kudos, birthdays, pulses) — a redundância explícita pedida cobre apenas reset de senha e cadastros.

## Detalhes técnicos
- Reaproveitar `notify-helpers.ts` (`lookupSlackUserByEmail`, `sendSlackDM`, `sendEmail`) no novo helper.
- Preservar respeito às `notification_preferences` **exceto** para reset de senha e aprovação de cadastro, que são obrigatórios (transacional/segurança) — hoje `send-password-reset-slack` e `notify-approved-collaborator` já ignoram prefs; manter assim.
- Audit logs continuam sendo a fonte de verdade para debugging (`USER_PASSWORD_RESET_SLACK`, `NOTIFY_APPROVED`, `NOTIFY_ADMINS_PENDING`).
