

## Plano: Adicionar notificação Slack para solicitação de alteração de dia de pagamento

### Problema
Atualmente, quando um colaborador PJ solicita alteração do dia de pagamento, apenas notificações por email são enviadas aos diretores. Falta a notificação via Slack.

### Alterações

#### 1. Edge Function `slack-notification/index.ts`
- Adicionar `PAYMENT_DAY_CHANGE_REQUEST` ao type union da interface `SlackNotificationRequest`
- Adicionar campos opcionais `currentPaymentDay` e `desiredPaymentDay`
- Adicionar bloco de mensagem para esse tipo, ex:
  ```
  *💰 Solicitação de Alteração de Dia de Pagamento*
  👤 *João Silva*
  📅 Dia atual: 10 → Dia desejado: 20
  ```

#### 2. `src/components/ProfileModal.tsx`
- Após o loop de envio de emails, adicionar chamada fire-and-forget à edge function `slack-notification` com type `PAYMENT_DAY_CHANGE_REQUEST`, enviando para o canal de aprovações (sem `approverEmail`, para ir ao canal geral).

### Arquivos a alterar
- `supabase/functions/slack-notification/index.ts`
- `src/components/ProfileModal.tsx`

