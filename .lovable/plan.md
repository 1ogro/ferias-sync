

## Plan: Password Reset + Link Multiple Auth Methods

### What exists today
- Login page (`/auth`) with email/password and Figma OAuth
- No password reset flow at all (no forgot password link, no reset page)
- No way for users to link additional auth methods to their account
- ProfileModal exists but only edits name/email/birthday

### Changes needed

#### 1. Forgot Password flow on Auth page
- Add "Esqueceu a senha?" link below the password field in the login tab
- Clicking it shows an inline form (or replaces login form) asking for email
- Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`
- Shows success toast

#### 2. New `/reset-password` page
- **File:** `src/pages/ResetPassword.tsx`
- Public route (not behind ProtectedRoute)
- Detects `type=recovery` in URL hash on mount
- Shows form with new password + confirm password
- Calls `supabase.auth.updateUser({ password })` to set new password
- On success, redirects to `/auth` with success toast

#### 3. Route registration
- **File:** `src/App.tsx` — add `/reset-password` route (public, lazy-loaded)

#### 4. Link/unlink auth identities in ProfileModal
- **File:** `src/components/ProfileModal.tsx` — add a "Métodos de Login" section
- Show current linked identities (from `user.identities`) with provider badges
- If user has no `email` identity: show button "Adicionar login com senha" that expands a set-password form calling `supabase.auth.updateUser({ password })`
- If Figma is enabled and user has no `figma` identity: show button "Vincular Figma" calling `signInWithFigma()` (Supabase auto-links when same email)
- If user has multiple identities: allow unlinking non-primary ones via `supabase.auth.unlinkIdentity()`

### Files to create/modify
| File | Action |
|------|--------|
| `src/pages/ResetPassword.tsx` | Create — password reset page |
| `src/pages/Auth.tsx` | Modify — add forgot password link/flow |
| `src/App.tsx` | Modify — add `/reset-password` route |
| `src/components/ProfileModal.tsx` | Modify — add linked auth methods section |

