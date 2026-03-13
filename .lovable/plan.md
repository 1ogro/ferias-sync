

## Plan: Admin Password Reset & Auth Method Management

### Overview
Add capability for admin/director users to reset a user's password (send reset email) and clear their authentication identities, all from the Admin page. This requires a new edge function since these operations need the Supabase service role key.

### Changes

#### 1. New Edge Function: `supabase/functions/admin-auth-management/index.ts`
- Accepts actions: `reset_password` and `clear_identities`
- Validates the caller is an admin using `has_role()` or checking `is_admin` on their people record
- `reset_password`: calls `supabase.auth.admin.generateLink({ type: 'recovery', email })` or `resetPasswordForEmail` with service role
- `clear_identities`: calls `supabase.auth.admin.deleteUser()` to remove the auth user entirely (keeping the `people` record), or selectively removes identities via admin API
- Uses `SUPABASE_SERVICE_ROLE_KEY` secret (already exists)

#### 2. Update `supabase/config.toml`
- Add `[functions.admin-auth-management]` with `verify_jwt = false` (we validate in code)

#### 3. Update `src/pages/Admin.tsx`
- Add two action buttons per user row (in the actions column):
  - "Resetar Senha" — sends password reset email via edge function
  - "Zerar Autenticação" — clears auth identities via edge function (with confirmation dialog)
- Both actions only visible to admin/director users
- Show confirmation dialogs before destructive actions

### Technical Details
- The edge function looks up the `auth.users` entry by email (from the `people` record) using the admin client
- For password reset: generates a recovery link and sends it to the user's email
- For clearing auth: deletes the user from `auth.users` (cascade deletes profiles), keeping the `people` record. The user can then re-register with the same person record.
- Admin validation: checks caller's JWT, looks up `is_admin` flag or `has_role('admin')`

### Files
| File | Action |
|------|--------|
| `supabase/functions/admin-auth-management/index.ts` | Create |
| `supabase/config.toml` | Modify — add function config |
| `src/pages/Admin.tsx` | Modify — add auth management buttons |

