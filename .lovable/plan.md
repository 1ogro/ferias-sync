## Contexto

O CTA **"Pedir Informações"** (na inbox e em RequestDetail) hoje envia email para o solicitante, mas a notificação no Slack cai no canal de aprovações em vez de chegar como DM ao colaborador. Causa: `slack-notification` é invocada sem `approverEmail`/`approverName`, então não há `slackUserId` para resolver e a função usa o fallback `SLACK_CHANNEL`.

## Mudanças

### 1. `supabase/functions/slack-notification/index.ts`
- Adicionar campos opcionais `recipientEmail` e `recipientName` em `SlackNotificationRequest`.
- Na resolução do `slackUserId`, priorizar `recipientEmail` (lookup por email) → fallback `recipientName` (lookup por nome) → fallback atual `approverEmail`/`approverName`.
- Comportamento de envio inalterado: se houver `slackUserId`, envia DM; senão, envia ao canal.

### 2. `src/pages/Inbox.tsx`
- No branch `ask_info`, buscar `email` e `nome` do solicitante (já buscamos email para o envio do email; aproveitar a mesma query incluindo `nome`).
- Passar `recipientEmail` e `recipientName` na chamada `slack-notification`.
- Manter o envio paralelo do email (`send-notification-email` com `type: 'REQUEST_INFO'`), já funcional.
- Toast: "Solicitação de informações enviada ao colaborador por email e Slack".

### 3. `src/pages/RequestDetail.tsx`
- Aplicar o mesmo ajuste no handler do botão "Pedir Informações": garantir envio do email para o solicitante e passar `recipientEmail`/`recipientName` na chamada do Slack.
- Se o arquivo ainda não dispara `send-notification-email`/`slack-notification` para esse CTA, adicionar as chamadas seguindo o padrão da inbox.

### 4. Validação
- Acionar "Pedir Informações" pela inbox e por RequestDetail.
- Conferir logs de `slack-notification`: `slack_lookup_method` resolvido pelo `recipientEmail`, status `sent`.
- Confirmar que o colaborador recebeu email + DM.

## Arquivos afetados
- `supabase/functions/slack-notification/index.ts`
- `src/pages/Inbox.tsx`
- `src/pages/RequestDetail.tsx`

Sem migração SQL.
