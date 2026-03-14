

## Plan: Slack Notifications for Admin Actions (Deactivation, Role Changes, Deletion)

### Current State
- `handleSubmit` (user edit) and `handleDelete` (user deletion) in `Admin.tsx` use direct Supabase client calls with no Slack notifications
- The `admin-auth-management` edge function already has Slack notification infrastructure

### Approach
Extend `admin-auth-management` edge function with a new action `notify_admin_change` that receives details about what changed and sends a Slack message. The frontend will call this after successful admin operations.

### Changes

#### 1. `supabase/functions/admin-auth-management/index.ts`
Add a new action `notify_admin_change` that accepts:
- `change_type`: `deactivation` | `reactivation` | `role_change` | `deletion`
- `target_name`, `target_email`
- `details` (e.g. old/new role)

Sends formatted Slack message and logs to audit_logs. Same admin validation as existing actions.

#### 2. `src/pages/Admin.tsx`
- After successful `handleSubmit`: detect if `ativo` or `papel` changed from original values, and if so call the edge function with `notify_admin_change`
- After successful `handleDelete`: call the edge function with `change_type: 'deletion'`
- Store the original person data before edit to compare changes

### Slack Message Formats
- **Deactivation**: "🚫 *Usuário Desativado* — Admin **{caller}** desativou **{target}** ({email})"
- **Reactivation**: "✅ *Usuário Reativado* — Admin **{caller}** reativou **{target}** ({email})"
- **Role change**: "🔄 *Mudança de Papel* — Admin **{caller}** alterou papel de **{target}** de {old} para {new}"
- **Deletion**: "🗑️ *Usuário Excluído* — Admin **{caller}** excluiu **{target}** ({email})"

### Files
| File | Action |
|------|--------|
| `supabase/functions/admin-auth-management/index.ts` | Modify — add `notify_admin_change` action |
| `src/pages/Admin.tsx` | Modify — call notification after edit/delete |

