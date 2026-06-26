## Problema

1. **Lista vazia no modal "Dar um kudos"**: `useActivePeople` faz `SELECT` direto em `people`, mas a RLS atual só permite admins e o próprio usuário lerem essa tabela. Usuários comuns recebem zero linhas — daí o dropdown sem nomes.
2. **Layout divergente do `/biscoito` no Slack**: a versão web pede um campo de texto livre "#geral ou ID do canal", enquanto no Slack o usuário só marca um checkbox "Postar em `#time`".

## Correções

### 1. Carregar pessoas via RPC SECURITY DEFINER

Nova migração criando `public.get_active_people_for_kudos()` (espelha `get_active_people_for_signup`, mas devolve só `id uuid, nome text`, sem email):

```sql
CREATE OR REPLACE FUNCTION public.get_active_people_for_kudos()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nome FROM people p WHERE p.ativo = true ORDER BY p.nome;
$$;
REVOKE EXECUTE ON FUNCTION public.get_active_people_for_kudos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_people_for_kudos() TO authenticated;
```

Em `src/hooks/useEngagement.ts`, trocar a query do `useActivePeople` por `supabase.rpc("get_active_people_for_kudos")`. Mantém o mesmo shape consumido em `Engagement.tsx`.

### 2. Alinhar layout ao `/biscoito`

Em `src/pages/Engagement.tsx` (`GiveKudosDialog`):

- Remover o `<Input>` de canal livre.
- Adicionar um `<Checkbox>` opcional "Postar também em `#time`" (mesma constante `SHARE_CHANNEL = "#time"` usada em `slack-slash-biscoito`).
- No submit, enviar `post_to_channel: share ? "#time" : null`.
- Manter título, categorias, contador 0/500 e descrição como já estão (idênticos ao modal do Slack).

Sem mudanças em edge functions, `kudos-send` ou tipos do Supabase além da regeneração automática.

## Validação

- Logar como usuário não-admin: abrir o modal e confirmar a lista populada com colegas ativos.
- Enviar um kudo com o checkbox marcado e verificar que aparece em `#time`; sem o checkbox, só vai como notificação interna.
- Conferir paridade visual com o modal do Slack (campos e ordem).
