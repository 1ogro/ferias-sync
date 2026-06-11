# Corrigir link de reset enviado pelo painel admin

## Problema

O reset manual feito pelo admin (`admin-auth-management`) envia o `action_link` bruto do Supabase. Isso causa dois erros confirmados nos logs:

1. **Redirect para localhost:3000** — o `generateLink` é chamado sem `redirectTo`, então o Supabase usa o Site URL padrão (`http://localhost:3000`) após verificar o token.
2. **Token consumido antes do clique** — o link `/verify` do Supabase é de uso único e executa no primeiro acesso. O crawler do Slack faz prefetch do link ao entregar a DM (verify bem-sucedido às 18:54:03 de IP AWS), e quando a Bruna clica, recebe `otp_expired`.

O fluxo "Esqueci minha senha" já está imune: ele monta o link no domínio do app (`/reset-password?token_hash=...&type=recovery`), e o token só é consumido quando a página executa `verifyOtp` no navegador — prefetch do Slack não executa JavaScript.

## Solução

### `supabase/functions/admin-auth-management/index.ts` (ação `reset_password`)

1. Chamar `generateLink` com `options.redirectTo = "https://ferias-sync.lovable.app/reset-password"`.
2. Em vez de usar `linkData.properties.action_link`, extrair `linkData.properties.hashed_token` e montar o link no domínio do app:
   `https://ferias-sync.lovable.app/reset-password?token_hash=<hashed_token>&type=recovery`
   (mesmo padrão já usado em `send-password-reset-slack`).
3. Usar esse link tanto na DM do Slack quanto no fallback de texto.
4. Registrar no audit log que o link foi gerado no formato `token_hash` (para rastreio futuro).

### Mesmo problema no fluxo de convite (mesma função)

Os convites via Slack também enviam `action_link` de uso único — o prefetch do Slack pode queimar o token do convite da mesma forma. Aplicar a mesma técnica: usar `hashed_token` com `type=invite` e validar via `verifyOtp` na página de destino (`/reset-password` já aceita `recovery`; para invite, montar com `type=recovery` não funciona — usaremos `generateLink` type `recovery` para usuários já criados ou ajustar a página para aceitar `type=invite` no `verifyOtp`).

### Validação

- Disparar reset de teste via função e conferir que o link gerado aponta para `ferias-sync.lovable.app/reset-password?token_hash=...`.
- Pedir para refazer o reset da Bruna e confirmar que ela consegue redefinir a senha.

## Detalhes técnicos

- A página `src/pages/ResetPassword.tsx` já trata `?token_hash=...&type=recovery` via `supabase.auth.verifyOtp` — nenhuma mudança de frontend é necessária para o reset.
- Para o convite, será necessário um pequeno ajuste em `ResetPassword.tsx` (ou página equivalente) para aceitar `type=invite` no `verifyOtp`.
- Nenhuma mudança de banco de dados.
