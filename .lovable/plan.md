

## Plano: Notificações Slack completas para todos os fluxos do sistema

### Situação atual

**Já notificam no Slack (canal admin):**
- Convite enviado (admin-auth-management: `send_invite`)
- Reset de senha admin (admin-auth-management: `reset_password`)
- Autenticação zerada (admin-auth-management: `clear_identities`)
- Ações admin: desativação, reativação, mudança de papel, exclusão (`notify_admin_change`)
- Convite aceito (useAuth: `INVITE_ACCEPTED`)
- Nova solicitação de férias/day-off (NewRequestForm: `NEW_REQUEST`)
- Aprovação/rejeição/info (Inbox: `APPROVAL`/`REJECTION`/`REQUEST_INFO`)
- Pessoa aprovada/rejeitada (ApprovePendingCollaboratorDialog/PendingCollaboratorsList)
- Novo cadastro pendente (NewCollaboratorForm: `NEW_PENDING_PERSON`)
- Alteração dia de pagamento (ProfileModal: `PAYMENT_DAY_CHANGE_REQUEST`)

**Faltam notificações Slack para:**
1. **Login do colaborador** (Auth.tsx `handleLogin`) — sem notificação
2. **Autocadastro (signup)** (Auth.tsx `handleSignup`) — sem notificação
3. **Solicitação de reset de senha pelo próprio usuário** (Auth.tsx `resetPasswordForEmail`) — sem notificação
4. **Login via Figma** (Auth.tsx `handleFigmaLogin`) — sem notificação
5. **Alteração de perfil** (ProfileModal: nome, email, data nascimento via `update_profile_for_current_user`) — sem notificação
6. **Configuração de contrato** (ContractDateSetup: `set_contract_data_for_current_user`) — sem notificação

### Alterações

#### 1. Edge Function `slack-notification/index.ts`
Adicionar novos tipos ao union:
- `USER_LOGIN` — login bem-sucedido
- `USER_SIGNUP` — autocadastro
- `USER_PASSWORD_RESET_REQUEST` — pedido de reset pelo próprio
- `USER_FIGMA_LOGIN` — login via Figma
- `PROFILE_UPDATE` — alteração de dados pessoais
- `CONTRACT_SETUP` — configuração de contrato

Adicionar campos opcionais necessários e blocos de mensagem para cada tipo. Todos vão para o canal admin (sem `approverEmail`).

#### 2. `src/pages/Auth.tsx`
- **`handleLogin`**: após login bem-sucedido, fire-and-forget `slack-notification` com type `USER_LOGIN`
- **`handleSignup`**: após signup bem-sucedido, fire-and-forget com type `USER_SIGNUP`
- **Forgot password**: após `resetPasswordForEmail` bem-sucedido, fire-and-forget com type `USER_PASSWORD_RESET_REQUEST`
- **`handleFigmaLogin`**: após login Figma bem-sucedido, fire-and-forget com type `USER_FIGMA_LOGIN`

#### 3. `src/components/ProfileModal.tsx`
- Após `update_profile_for_current_user` bem-sucedido, fire-and-forget com type `PROFILE_UPDATE` informando o que mudou

#### 4. `src/components/ContractDateSetup.tsx`
- Após `set_contract_data_for_current_user` bem-sucedido, fire-and-forget com type `CONTRACT_SETUP` informando modelo e data

### Formato das mensagens Slack

```text
🔐 Login — João Silva (joao@email.com)
📝 Autocadastro — João Silva (joao@email.com) se cadastrou no sistema
🔑 Reset de Senha Solicitado — joao@email.com solicitou recuperação de senha
🎨 Login Figma — João Silva (joao@email.com)
👤 Perfil Atualizado — João Silva alterou seus dados pessoais
📋 Contrato Configurado — João Silva configurou contrato CLT, data: 01/01/2024
💰 Alteração Dia Pagamento — (já existe)
```

### Arquivos a alterar
| Arquivo | Ação |
|---------|------|
| `supabase/functions/slack-notification/index.ts` | Adicionar 6 novos tipos de mensagem |
| `src/pages/Auth.tsx` | Adicionar 4 chamadas fire-and-forget |
| `src/components/ProfileModal.tsx` | Adicionar 1 chamada fire-and-forget |
| `src/components/ContractDateSetup.tsx` | Adicionar 1 chamada fire-and-forget |

### Notas
- Todas as notificações seguem o padrão fire-and-forget existente (`.catch(err => console.warn(...))`)
- Todas vão para o canal admin padrão (`SLACK_CHANNEL_APPROVALS`)
- Não bloqueiam o fluxo principal em caso de falha
- Login/signup no Auth.tsx requer apenas o email (não temos `person` disponível ainda nesse contexto — será incluído quando possível)

