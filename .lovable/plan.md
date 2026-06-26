## Objetivo

Quando um `/biscoito` gerar um cadastro pendente (lado remetente ou destinatário), enviar DM no Slack também para os **Diretores**, e não apenas para Admins.

## Situação atual

Em `supabase/functions/slack-interactions/index.ts` (função `notifyAdmins`, linha ~427), a query busca destinatários apenas com `is_admin = true`:

```ts
.from("people").select("email, nome").eq("is_admin", true).eq("ativo", true)
```

Diretores que não tenham `is_admin = true` ficam de fora da notificação.

## Mudança

Ampliar a query para incluir também `papel = 'DIRETOR'`, deduplicando por email:

```ts
const { data: recipients } = await supabase
  .from("people")
  .select("email, nome, papel, is_admin")
  .eq("ativo", true)
  .or("is_admin.eq.true,papel.eq.DIRETOR");
```

O restante do fluxo (lookup por email → `conversations.open` → `chat.postMessage`) permanece igual. O texto da DM continua o mesmo:

> 🔔 Novo cadastro pendente via /biscoito
> • *Fulano enviou* um biscoito (email)
> Aprove em Administração → Cadastros Pendentes para creditar os pontos retroativamente.

## Escopo

- **Alterado**: apenas a função `notifyAdmins` dentro do bloco `biscoito_submit` em `supabase/functions/slack-interactions/index.ts`.
- **Não alterado**: modal, inserção de kudo/pending_people, cards nos canais, DM ao destinatário, pontuação, RLS, schema.

## Observações

- A DM respeita o já existente `users.lookupByEmail`; diretores sem email no Slack são silenciosamente ignorados (mesmo comportamento atual para admins).
- Não há preferência de notificação específica para esse evento hoje — mantemos consistente com o comportamento atual de admins.
