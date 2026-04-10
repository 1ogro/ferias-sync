

## Plano: Localizar usuário no Slack por nome quando email não encontrado

### Problema
A função `sendSlackDM` em `admin-auth-management/index.ts` usa apenas `users.lookupByEmail` para encontrar o usuário no Slack. Se o email cadastrado no sistema não corresponde ao email usado no Slack, a busca falha com "Usuário não encontrado".

### Solução
Adicionar fallback na função `sendSlackDM`: quando `lookupByEmail` falhar, buscar o usuário paginando `users.list` e comparando pelo nome (`real_name`, `display_name`, `name`). A mesma lógica será aplicada na `slack-notification/index.ts` para o lookup por `approverEmail`.

### Mudanças

#### 1. `supabase/functions/admin-auth-management/index.ts`
- Alterar `sendSlackDM` para aceitar um parâmetro adicional `personName` (opcional).
- Se `lookupByEmail` falhar e `personName` for fornecido, paginar `users.list` buscando por nome (case-insensitive).
- Atualizar a chamada de `sendSlackDM` para passar `targetPerson.nome`.

#### 2. `supabase/functions/slack-notification/index.ts`
- Adicionar campo `personName` ao payload (já existe como `requesterName`).
- Na busca do `approverEmail`, se `lookupByEmail` falhar, fazer fallback por nome usando `users.list`.

#### 3. Deploy das edge functions atualizadas.

### Arquivos a alterar
- `supabase/functions/admin-auth-management/index.ts`
- `supabase/functions/slack-notification/index.ts`

