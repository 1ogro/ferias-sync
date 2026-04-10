

## Plano: Recuperação de senha via Slack DM

### Situação atual
O botão "Resetar senha" (`reset_password`) sempre envia email de recuperação via `generateLink({ type: "recovery" })`. Não há opção de enviar o link via Slack DM.

### Solução
Replicar o padrão já usado em `send_invite`: ao clicar no botão de reset, abrir um diálogo perguntando o método (Email, Slack ou Ambos), e na edge function enviar o link de recuperação via Slack DM usando `sendSlackDM` com fallback por nome.

### Mudanças

#### 1. `src/pages/Admin.tsx`
- Adicionar estado `resetPasswordTarget` (similar ao `inviteTarget`).
- Trocar o `onClick` do botão de reset para abrir um diálogo de escolha de método (Email / Slack / Ambos).
- Passar `method` para `handleAdminAuthAction` no action `reset_password`.

#### 2. `supabase/functions/admin-auth-management/index.ts`
- No bloco `action === "reset_password"`, aceitar `invite_method` do body (default: `"email"`).
- Se método inclui Slack: gerar link de recovery via `generateLink({ type: "recovery" })`, montar blocks com o link, e enviar via `sendSlackDM` (que já faz fallback por nome).
- Se método inclui email: manter comportamento atual (o `generateLink` com type recovery já dispara email automaticamente, ou usar `resetPasswordForEmail`).

#### 3. Deploy da edge function atualizada.

### Arquivos a alterar
- `src/pages/Admin.tsx` — diálogo de escolha de método para reset
- `supabase/functions/admin-auth-management/index.ts` — lógica de envio via Slack no reset_password

