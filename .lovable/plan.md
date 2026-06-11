## Problema

O link de recuperação enviado por email/Slack é o `action_link` do Supabase, que:
1. Aponta para `https://uhphxyhffpbnmsrlggbe.supabase.co/auth/v1/verify?...` (por isso "os links vão com supabase")
2. Falha com `403: Email link is invalid or has expired` e redireciona para `localhost:3000` (Site URL do projeto), porque o `redirect_to` não está na allowlist de Redirect URLs do Supabase — confirmado nos logs de auth.

## Solução

Montar o link diretamente no domínio do app usando o `hashed_token` retornado por `generateLink`, sem passar pelo endpoint `/verify` do Supabase. O token é validado no próprio app via `supabase.auth.verifyOtp()`.

### 1. `supabase/functions/send-password-reset-slack/index.ts`
- Após `generateLink`, em vez de usar `linkData.properties.action_link`, montar:
  `recoveryLink = ${redirectTo}?token_hash=${linkData.properties.hashed_token}&type=recovery`
- O link enviado no email e na DM do Slack passa a exibir o domínio do app (`https://ferias-sync.lovable.app/reset-password?...`).
- Nada mais muda na função (DM, email Resend, audit logs continuam iguais).

### 2. `src/pages/ResetPassword.tsx`
- Ler `token_hash` e `type` dos query params na montagem.
- Se presentes, chamar `supabase.auth.verifyOtp({ type: 'recovery', token_hash })`:
  - Sucesso → `setIsRecovery(true)` e o usuário define a nova senha (fluxo atual de `updateUser` permanece).
  - Falha (token expirado/usado) → mensagem clara "Link inválido ou expirado" com botão para solicitar novo link.
- Manter o fallback atual (evento `PASSWORD_RECOVERY` e hash `type=recovery`) para compatibilidade.

## Benefícios
- Link com o domínio do app, não do Supabase.
- Elimina o erro 403/redirect para localhost — não depende mais da allowlist de Redirect URLs nem da Site URL.
- O token só é consumido quando o usuário abre a página do app (scanners de email que fazem GET não invalidam mais o fluxo via /verify).

## Validação
1. Solicitar reset com email válido → conferir que o link no email/DM começa com `https://ferias-sync.lovable.app/reset-password?token_hash=`.
2. Abrir o link → página valida o token e permite definir nova senha.
3. Reusar o mesmo link → mensagem de "link inválido ou expirado".
4. Login com a nova senha funciona.