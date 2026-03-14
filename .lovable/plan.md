

## Plan: Notificar gestor por email quando convite for aceito

### Contexto
Quando um gestor/diretor envia convite via `admin-auth-management` (action `send_invite`), o `actor_id` fica registrado no `audit_logs` com ação `ADMIN_SEND_INVITE`. Quando o colaborador aceita o convite e faz login, precisamos detectar isso e enviar email ao remetente do convite.

### Abordagem
Detectar no frontend (`useAuth.tsx`) quando um usuário faz login pela primeira vez após aceitar um convite. Verificar no `audit_logs` se existe um registro `ADMIN_SEND_INVITE` para aquele `person_id` sem um correspondente `INVITE_ACCEPTED`. Se sim, disparar a notificação por email (fire-and-forget) e registrar `INVITE_ACCEPTED` no audit_logs.

### Implementação

#### 1. `supabase/functions/send-notification-email/index.ts`
- Adicionar tipo `INVITE_ACCEPTED` à interface `NotificationRequest`
- Adicionar campos opcionais: `collaboratorName`, `collaboratorEmail`
- Gerar template de email:
  - Assunto: "Convite aceito — {nome} criou sua conta"
  - Corpo: "{collaboratorName} ({email}) aceitou o convite e criou sua conta no sistema"

#### 2. `src/hooks/useAuth.tsx`
- Após `fetchPersonData` carregar o `person` com sucesso, verificar (uma vez por sessão) se existe `ADMIN_SEND_INVITE` no `audit_logs` para esse `person_id` sem `INVITE_ACCEPTED`
- Se encontrar, buscar o `actor_id` (quem enviou o convite), buscar nome/email do actor em `people`, e invocar `send-notification-email` com tipo `INVITE_ACCEPTED`
- Inserir registro `INVITE_ACCEPTED` no `audit_logs` para evitar reenvio
- Tudo fire-and-forget, não bloqueia login

### Arquivos
| Arquivo | Ação |
|---------|------|
| `supabase/functions/send-notification-email/index.ts` | Adicionar tipo INVITE_ACCEPTED |
| `src/hooks/useAuth.tsx` | Adicionar verificação de convite aceito após login |

