

## Plan: Enviar convite de criação de conta da tabela Admin

### O que muda
Adicionar um botão "Enviar Convite" na coluna de ações da tabela Admin para usuários sem autenticação ativa. O convite usa `generateLink({ type: 'invite' })` do Supabase Admin API, que envia um email com link para o usuário criar sua conta.

### Implementação

#### 1. `supabase/functions/admin-auth-management/index.ts`
Adicionar nova action `send_invite`:
- Usa `adminClient.auth.admin.inviteUserByEmail(targetPerson.email)` para enviar convite
- Se o email já tem auth user, retorna erro
- Cria profile automaticamente vinculando o `auth.user.id` ao `person_id`
- Audit log + Slack notification: "📩 *Convite Enviado* — Admin **{caller}** enviou convite de criação de conta para **{target}** ({email})"

#### 2. `src/pages/Admin.tsx`
- Adicionar handler `handleSendInvite(personId)` que chama a edge function com `action: 'send_invite'`
- Na coluna de ações (somente para `isDirector`), mostrar botão de convite (ícone `Mail`) apenas para usuários sem auth (`!authenticatedPersonIds.has(person.id)`)
- Loading state + toast de sucesso/erro

### Arquivos
| Arquivo | Ação |
|---------|------|
| `supabase/functions/admin-auth-management/index.ts` | Modificar — adicionar action `send_invite` |
| `src/pages/Admin.tsx` | Modificar — adicionar botão de convite |

