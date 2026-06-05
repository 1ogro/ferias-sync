## Correção: Botão de convite some após "Zerar autenticação"

**Causa raiz:** `clear_identities` remove o auth user mas deixa órfão na tabela `profiles`. O frontend usa `profiles.person_id` para marcar a pessoa como autenticada (✓ Sim), escondendo o botão `<Mail/>` de convite.

### Mudanças

1. **`supabase/functions/admin-auth-management/index.ts` → handler `clear_identities`**
   - Após (ou na ausência de) deleção do auth user, executar sempre:
     ```ts
     await supabaseAdmin.from("profiles").delete().eq("person_id", person_id);
     ```
   - Manter o log `ADMIN_CLEAR_AUTH` em `audit_logs`.
   - Ajustar mensagem de sucesso para refletir limpeza do profile órfão quando aplicável.

2. **Migração: limpar profiles órfãos existentes**
   - Criar função `cleanup_orphan_profiles()` SECURITY DEFINER, restrita a admin (`is_current_user_admin()`).
   - Deleta `profiles` cujo `user_id` não exista em `auth.users`.
   - Executar a função uma vez no próprio migration para corrigir o estado atual (incluindo a pessoa afetada).

### Fora de escopo
- FK `profiles.user_id → auth.users ON DELETE CASCADE` (risco maior; limpeza explícita já resolve).
- Alterar o critério visual do badge "✓ Sim / ✗ Não".

### Validação
Após deploy: a pessoa que aparecia incorretamente como "✓ Sim" passa a "✗ Não" e o botão `<Mail/>` reaparece, permitindo reenvio do convite.
