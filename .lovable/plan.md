## Diagnóstico

Verifiquei o banco e o código:

- **Haroldo Portella (pessoa_008)** — Há 3 registros em `audit_logs` (`ADMIN_PASSWORD_RESET`, method=`slack`, results=`[slack]`) hoje. Ou seja, o admin pediu reset via Slack e a função `admin-auth-management` reportou sucesso no envio do DM — mas o Haroldo não recebeu. Isso é compatível com o DM ter ido para o **usuário Slack errado** (ver causa abaixo).
- **Bruna Duarte (pessoa_025)** — Existe apenas o ping no canal `USER_PASSWORD_RESET_REQUEST` (auto-serviço pelo "Esqueci minha senha"), mas **nenhum `USER_PASSWORD_RESET_SLACK` em `audit_logs`**. Ou seja, a função `send-password-reset-slack` foi chamada pelo front-end mas retornou antes de persistir o audit (provável `person_not_found`, falha no `generateLink`, ou falha na lookup do Slack).

### Causa raiz provável

Em ambos os fluxos (`admin-auth-management` e `send-password-reset-slack`) o helper `findSlackUserByName` faz match **muito frouxo** (`includes` em ambos os sentidos):

```ts
return candidates.some((c) => c === q || c.includes(q) || q.includes(c));
```

Isso faz com que "Haroldo" possa casar com qualquer Slack member cujo `real_name` contenha a palavra, ou cujo display_name esteja contido em "Haroldo Portella". Da mesma forma "Bruna" casaria com qualquer Bruna do workspace. Como o DM é enviado direto ao `userId`, o destinatário errado recebe (ou recebe um bot/usuário desativado) sem nenhum erro do Slack — daí o `results:[slack]` "sucesso".

Além disso, o audit log atual não registra **qual** `slack_user_id` foi usado, então é impossível depurar sem novos logs.

## Plano

### 1. Endurecer a busca de usuário no Slack (`admin-auth-management` e `send-password-reset-slack`)

- Trocar o match por **igualdade estrita** em `name`, `real_name`, `profile.display_name`, `profile.display_name_normalized`, `profile.real_name_normalized` (case-insensitive, trim, sem acentos).
- Ignorar usuários com `deleted=true`, `is_bot=true` ou `is_restricted/ultra_restricted=true` quando há ambiguidade.
- Se houver **mais de um match** por nome, retornar `null` (não chutar) e registrar `multiple_matches` no log.

### 2. Priorizar `lookupByEmail` e nunca cair em fallback por nome silenciosamente

- Em `admin-auth-management.sendSlackDM`: se `lookupByEmail` falhar, **não** chamar `findSlackUserByName` automaticamente — retornar erro claro (`slack_user_not_found_by_email`) para que o admin saiba que precisa cadastrar o email correto no Slack ou usar outro método.
- Em `send-password-reset-slack` manter o fallback por nome, mas apenas com a busca estrita do item 1.

### 3. Persistir diagnóstico no `audit_logs`

Incluir no `payload` de `ADMIN_PASSWORD_RESET` e `USER_PASSWORD_RESET_SLACK`:
- `slack_user_id` (id real do destinatário, ex. `U09…`)
- `slack_lookup_method` (`email` | `name` | `none`)
- `slack_dm_ts` (timestamp da mensagem retornado pelo Slack)
- `slack_dm_error` quando houver

Isso permite confirmar para quem o DM foi enviado.

### 4. Logs detalhados em `send-password-reset-slack`

A função já loga estágios via `log()`, mas hoje o painel de logs está vazio para os IDs investigados. Vou adicionar logs em pontos hoje silenciosos:
- início do request (com `identifier` mascarado)
- resultado da query `people` (encontrado/não encontrado + id)
- resultado de `generateLink`
- payload final retornado

### 5. Validar manualmente após o deploy

Depois das mudanças, pedir para você:
1. Disparar novamente o reset para Haroldo via tela de admin.
2. Pedir para Bruna usar o "Esqueci minha senha".
3. Eu releio `audit_logs` + logs da edge function e confirmo o `slack_user_id` real — se ainda for o usuário errado, ajustamos a heurística (ex.: vincular `slack_user_id` direto na tabela `people`).

## Arquivos afetados

- `supabase/functions/admin-auth-management/index.ts` — endurecer lookup, remover fallback por nome silencioso, enriquecer audit.
- `supabase/functions/send-password-reset-slack/index.ts` — endurecer `findSlackUserByName`, enriquecer audit e logs.

Nenhuma migração de banco é necessária nesta etapa.
