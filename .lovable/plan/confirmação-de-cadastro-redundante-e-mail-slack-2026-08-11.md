# Confirmação de cadastro redundante (E-mail + Slack)

## Objetivo

Quando um colaborador cria a conta, ele deve receber a confirmação de cadastro por **dois canais ao mesmo tempo**: e-mail e DM no Slack. Se não for possível achar o usuário no Slack (nem pelo e-mail corporativo, nem pelo pessoal), o app avisa na tela para procurar o administrador.

## Fluxo

```text
cadastro concluído (self-signup ou signup padrão)
        |
        +--> e-mail de boas-vindas/confirmação
        |
        +--> busca Slack por email corporativo -> pessoal -> slack_user_id salvo
                 |-- achou  -> DM de confirmação + grava slack_user_id em people
                 |-- não    -> resposta marca slack_delivered=false
                                 |
                                 v
                        aviso na tela: "conta criada, mas não achamos
                        seu usuário no Slack — procure o administrador"
```

## Alterações

1. **`supabase/functions/self-signup/index.ts`**
   - Após criar o usuário e vincular o `profile`, disparar a confirmação nos dois canais usando os helpers já existentes em `_shared/notify-helpers.ts` (`lookupSlackUserByEmail`, `sendSlackDM`, `sendEmail`).
   - Lookup do Slack em cascata: `people.slack_user_id` → e-mail corporativo → `email_pessoal`. Se encontrar por e-mail, faz backfill do `slack_user_id` (mesmo padrão já usado no Slack de kudos).
   - Envio em paralelo (`Promise.allSettled`), sem bloquear o retorno: a resposta inclui `slack_delivered: true|false` e `email_delivered: true|false`.
   - Registrar em `audit_logs` a ação `SIGNUP_CONFIRMATION_SENT` com os canais efetivamente entregues.

2. **`src/pages/Auth.tsx`**
   - Ao receber sucesso do `self-signup`, se `slack_delivered === false`, mostrar toast/aviso: conta criada, confirmação enviada por e-mail, mas o usuário do Slack não foi localizado — procurar o administrador.
   - No caminho de fallback (signup padrão com confirmação por e-mail), também invocar a notificação Slack de confirmação para o mesmo endereço, para manter a redundância.

3. **Catálogo de notificações** (`src/lib/notificationsCatalog.ts`)
   - Adicionar a entrada "Confirmação de cadastro" (categoria Autenticação, canais Slack DM + E-mail, gatilho evento, edge function `self-signup`) para o painel `/admin/notificacoes` refletir a nova notificação.

## Detalhes técnicos

- Sem migração de banco: `people.slack_user_id`, `email_pessoal` e `audit_logs` já existem.
- Mensagem do Slack e do e-mail em português, com nome do colaborador e link direto para o app.
- Falha em um canal nunca derruba o cadastro — os envios são fire-and-forget com log.
