

## Plano: Corrigir sincronização entre `is_admin` e `user_roles`

### Causa raiz
A RLS da tabela `people` usa `is_current_user_admin()` → `has_role(auth.uid(), 'admin')` → consulta `user_roles`. Porém, vários usuários com `is_admin = true` na tabela `people` não têm registro correspondente em `user_roles`. Isso faz com que o UPDATE seja silenciosamente rejeitado pelo banco.

### Mudanças

#### 1. Migração: Sincronizar dados existentes
- Inserir na `user_roles` um registro `admin` para cada usuário que tem `is_admin = true` em `people` e já possui um `profile` vinculado, mas não tem entrada em `user_roles`.

#### 2. Migração: Criar trigger de sincronização automática
- Criar um trigger na tabela `people` que, ao alterar `is_admin` de `false` para `true`, insere automaticamente o role `admin` em `user_roles` (e remove quando volta para `false`).
- Isso garante que futuras alterações de `is_admin` mantenham as duas tabelas sincronizadas.

#### 3. Código: Validar resultado do UPDATE no frontend
- No componente Admin (onde gestores/diretores alteram papéis), verificar se o `UPDATE` retornou dados antes de inserir o log de auditoria.
- Se o UPDATE falhou (RLS bloqueou), exibir toast de erro em vez de sucesso.

### Arquivos a alterar
- Nova migração SQL (sync `user_roles` + trigger)
- `src/pages/Admin.tsx` — validar retorno do UPDATE antes de logar auditoria

### Impacto
- Vinicius Cruz e outros admins sem `user_roles` passarão a ter permissões efetivas imediatamente.
- Alterações futuras de `is_admin` serão refletidas automaticamente.

