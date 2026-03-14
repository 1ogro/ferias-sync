

## Plan: Permitir Gestores enviarem convites de conta

### Contexto
Atualmente, apenas diretores/admins veem o botão de enviar convite e a edge function bloqueia gestores. Precisamos abrir o `send_invite` para gestores também.

### Mudanças

#### 1. `supabase/functions/admin-auth-management/index.ts`
- Mover a validação de papel para depois do parse do body
- Para a action `send_invite`, permitir também `GESTOR`
- Para as demais actions (`reset_password`, `clear_identities`, etc.), manter restrição a `DIRETOR`/admin

#### 2. `src/pages/Admin.tsx`
- O bloco do botão de convite (ícone Mail, linhas ~915-937) está dentro de `{isDirector && (<>...</>)}` junto com outros botões de auth (reset, clear)
- Extrair o botão de convite para fora do bloco `isDirector`, mostrando-o para qualquer usuário com `isDirector || isManager`
- Os botões de reset password e clear identities continuam restritos a `isDirector`

### Arquivos
| Arquivo | Ação |
|---------|------|
| `supabase/functions/admin-auth-management/index.ts` | Modificar — permitir GESTOR no send_invite |
| `src/pages/Admin.tsx` | Modificar — mostrar botão convite para gestores |

