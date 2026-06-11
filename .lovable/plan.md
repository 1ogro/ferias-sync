## Problema

A aba "Aprovação de Cadastros" falha ao carregar porque `PendingCollaboratorsList.tsx` faz um embed PostgREST usando os nomes de foreign key:

```ts
gestor:people!pending_people_gestor_id_fkey(...)
creator:people!pending_people_created_by_fkey(...)
```

Mas a tabela `public.pending_people` **não tem nenhuma foreign key** (`SELECT conname FROM pg_constraint ... → []`). Sem essas FKs, o PostgREST retorna erro "Could not find a relationship" e o `fetchPendingPeople` cai no catch mostrando o toast de erro.

## Correção

Criar uma migração que adiciona as duas foreign keys referenciando `public.people(id)` com os nomes exatos que o cliente já usa:

- `pending_people_gestor_id_fkey`: `gestor_id → people(id)` `ON DELETE SET NULL`
- `pending_people_created_by_fkey`: `created_by → people(id)` `ON DELETE SET NULL`
- (bônus, mesmo padrão) `pending_people_reviewed_by_fkey`: `reviewed_by → people(id)` `ON DELETE SET NULL` — útil para futuros embeds e mantém integridade

Não altero RLS, grants, nem código frontend — o componente já está correto, só falta a relação no banco.

## Validação

Após a migração, recarregar `/admin` na aba de aprovações: a lista deve carregar sem o toast "Erro ao carregar cadastros pendentes".
