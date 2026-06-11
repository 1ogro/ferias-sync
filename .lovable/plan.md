## Contexto

Hoje `Auth.tsx > "Esqueceu a senha?"` dispara em paralelo:
- `supabase.auth.resetPasswordForEmail()` (email padrão Supabase)
- `supabase.functions.invoke('send-password-reset-slack')` (DM no Slack — fire-and-forget)

A função `send-password-reset-slack` já existe, está com `verify_jwt = false` e tem fallback de lookup (`users.lookupByEmail` → `findSlackUserByName`). Os logs estão vazios e o toast atual diz "link enviado" mesmo quando a DM falha silenciosamente. Além disso, a função só consegue gerar o link de recovery se já existir um `auth.users` com aquele email — bloqueando colaboradores que ainda não confirmaram o email ou que têm email diferente do cadastrado.

## Objetivos

1. Fazer a DM do Slack chegar de fato (diagnóstico + correções).
2. Permitir reset por Slack mesmo quando o usuário **não tem email cadastrado/confirmado** no `auth.users`.

## Mudanças

### 1. Diagnóstico do envio da DM (`send-password-reset-slack`)

- Adicionar logs estruturados em cada etapa: `person_found`, `auth_user_found`, `link_generated`, `slack_lookup_method` (`email` | `name` | `none`), `dm_sent`.
- Retornar no JSON (somente em modo debug, header `x-debug: 1`) o `dm_status` e `dm_error`, sem vazar para chamadas normais.
- Validar `SLACK_BOT_TOKEN` e `SLACK_CHANNEL_APPROVALS` no boot e logar `skipped_no_token` com clareza.
- Confirmar escopos do bot: `users:read`, `users:read.email`, `chat:write`, `im:write`. Se faltar algum, abrir aviso no canal de admins.

### 2. Reset por Slack sem depender de email confirmado

Refatorar `send-password-reset-slack` para aceitar dois caminhos:

```text
body: { identifier: string, redirectTo?: string }
```

`identifier` pode ser:
- email (comportamento atual), OU
- `@handle` ou nome do Slack.

Fluxo novo:

```text
1. Resolver `person` em `people` por email OU por nome (ilike).
2. Resolver `slack_user_id`:
   a. Se identifier é email → users.lookupByEmail.
   b. Senão → findSlackUserByName(identifier).
   c. Fallback: lookupByEmail(person.email).
3. Resolver/garantir auth user:
   a. Se já existe auth.users com person.email → generateLink('recovery').
   b. Se NÃO existe ou email não confirmado → admin.generateLink('magiclink')
      criando-o on-the-fly com email_confirm=true (usando service role).
      Link aponta para /reset-password e força troca de senha.
4. Enviar DM com o link via chat.postMessage no DM (channel = slack_user_id).
5. Audit log + notificação no canal de admins com status real.
```

Importante: NÃO disparar email automaticamente nesse novo caminho (só Slack), porque o usuário-alvo é justamente quem não tem email funcionando.

### 3. UI em `src/pages/Auth.tsx`

- Renomear o input de "Email da conta" para "Email **ou** usuário do Slack".
- Se o input não parece email, pular `supabase.auth.resetPasswordForEmail()` e chamar somente a edge function.
- Atualizar o toast para refletir o canal real: "Enviamos o link pelo Slack" / "Enviamos por email e Slack".
- Em caso de falha confirmada da DM (response do edge function com `dm_status: failed`), exibir toast destrutivo orientando contatar admin.

### 4. Auditoria

Manter `USER_PASSWORD_RESET_SLACK` em `audit_logs` com payload incluindo: `identifier_type` (`email|slack_handle`), `slack_lookup_method`, `dm_status`, `auth_user_created` (bool).

## Arquivos afetados

- `supabase/functions/send-password-reset-slack/index.ts` — refator descrito acima.
- `src/pages/Auth.tsx` — UI/handler de "Esqueceu a senha?".
- Sem migração SQL.

## Validação

1. Reset com email cadastrado e Slack vinculado → recebe email + DM.
2. Reset com email não confirmado → recebe DM com link de recovery.
3. Reset informando handle do Slack (sem email) → recebe DM.
4. Reset com identificador inválido → resposta 200 sem vazar info, mas log interno marca `not_found`.
5. Conferir logs da edge function após cada cenário.
