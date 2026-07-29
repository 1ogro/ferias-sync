## Contexto verificado

- **Ariana** (`pessoa_037`, email `aneves.adncti@rededor.com.br`) tem `auth.users` (`cdec2bf6…`) com login e reset de senha bem-sucedidos hoje, **mas não tem linha em `public.profiles`**. Sem esse vínculo, o `ProtectedRoute` a joga para `/setup-profile` a cada login, e o "Confirmar" está falhando.
- Não há trigger `handle_new_user` criando profile automático. `profiles` tem `UNIQUE(user_id)` e `UNIQUE(person_id)` — nenhuma linha órfã bloqueando o insert.
- O **hard reset ainda existe** no backend (`admin-auth-management` action `clear_identities`) e no frontend (`src/pages/Admin.tsx` linhas 1072-1092), gated em `isDirector`. O Raul é diretor, então tecnicamente deveria ver o botão — porém ele é só um ícone `ShieldOff` sem rótulo dentro de uma linha muito cheia, o que explica a percepção de "sumiu".

## Plano

### 1. Destravar a Ariana agora (operacional, sem código)
- Rodar `clear_identities` para `pessoa_037` (apaga `auth.users` + qualquer profile órfão).
- Enviar novo convite via `send_invite` (email + Slack). Esse fluxo cria a linha em `profiles` já ligada a `pessoa_037` na hora do invite, então quando ela definir a senha ela cai direto autenticada, sem passar por `/setup-profile`.
- Registrar em `audit_logs` a razão da intervenção manual.

### 2. Diagnosticar o erro do `/setup-profile` (para não repetir)
- Adicionar log estruturado em `createProfile` (`useAuth.tsx`) capturando `error.code`, `error.message` e `error.details` do Supabase, para que o próximo caso mostre a causa exata no console e nos toasts.
- Se o erro for identificado como duplicate key ou RLS check, tratar com fallback silencioso (buscar profile existente antes de tentar inserir).

### 3. Tornar o hard reset visivelmente acessível em `/admin`
- Trocar o botão só-ícone `ShieldOff` por botão com ícone + label ("Zerar auth") em telas ≥ md, mantendo o tooltip.
- Agrupar os três botões de auth (Convidar / Resetar senha / Zerar auth) em um menu dropdown "Auth ▾" quando existir pelo menos um deles, para reduzir ruído visual e deixar as opções sempre encontráveis.
- Manter o gate `isDirector` e o `AlertDialog` de confirmação atuais.

## Detalhes técnicos

- **Migração / operação de dados**: usar a Edge Function `admin-auth-management` autenticado como diretor (Raul) via `supabase.functions.invoke('admin-auth-management', { body: { action: 'clear_identities', person_id: 'pessoa_037' } })` e depois `action: 'send_invite'` com `invite_method: 'both'`. Alternativa segura: eu executo via `supabase--curl_edge_functions` já autenticado, ou por SQL direto (delete cascata em `auth.users` + reinvite pela UI).
- **`src/hooks/useAuth.tsx`**: envolver o `insert` em `createProfile` com `console.error({ code, message, details, hint })` e, quando `code === '23505'`, refazer `fetchPersonData` antes de retornar erro.
- **`src/pages/Admin.tsx`** (~linhas 1048-1094): novo componente `AuthActionsMenu` com `DropdownMenu` (já usado no projeto) contendo "Enviar convite", "Resetar senha", "Zerar autenticação". Preserva os dialogs existentes (`resetPasswordTarget`, `clearAuthTarget`).

## Fora de escopo

- Não alterar a Edge Function `admin-auth-management`.
- Não mudar as RLS de `profiles`.
- Não mexer no fluxo de `/setup-profile` além do log/fallback.
