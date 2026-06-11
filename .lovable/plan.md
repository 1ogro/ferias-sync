## Problema

A função `send-password-reset-slack` chama `auth.admin.generateLink({ type: 'recovery', email })` sem passar `redirectTo`. Nesse caso o Supabase usa o **Site URL** configurado no projeto, que está apontando para `http://localhost`. Por isso a mensagem no Slack chega com link `https://localhost/...`.

O fluxo de e-mail (`resetPasswordForEmail` no `Auth.tsx`) já passa `redirectTo: ${window.location.origin}/reset-password` e por isso funciona corretamente.

## Solução

Passar a URL de redirect também na geração do link usada pela edge function, alinhando com o que o cliente já faz.

### 1. `src/pages/Auth.tsx`
No `invoke('send-password-reset-slack', ...)`, enviar também `redirectTo`:

```ts
body: {
  email: forgotEmail,
  redirectTo: `${window.location.origin}/reset-password`,
}
```

### 2. `supabase/functions/send-password-reset-slack/index.ts`
- Ler `redirectTo` do body (string, opcional, validar que começa com `https://` e não contém `localhost`).
- Fallback seguro caso não venha: usar env var `PUBLIC_APP_URL` e, por último, `https://ferias-sync.lovable.app/reset-password`.
- Passar para o generateLink:

```ts
adminClient.auth.admin.generateLink({
  type: 'recovery',
  email: person.email,
  options: { redirectTo },
})
```

### 3. Validação
- Disparar "Esqueci a senha" com email do Pedro Belsito e conferir nos logs da função que `recoveryLink` começa com o domínio público.
- Conferir DM no Slack com link clicável apontando para `https://ferias-sync.lovable.app/reset-password?...`.

## Observação (opcional, fora do escopo do código)
O ideal também é corrigir o **Site URL** no painel do Supabase para `https://ferias-sync.lovable.app` — isso resolve qualquer outro fluxo que dependa do default. Posso indicar onde ajustar se quiser, mas a correção no código acima já blinda esse fluxo específico.
