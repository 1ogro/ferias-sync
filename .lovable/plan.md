## Objetivo

Após a aprovação de um cadastro pendente (qualquer origem, com tratamento especial para `slack_biscoito`), o novo colaborador recebe notificação por DM no Slack **e** email, com link para entrar no app, e é guiado por um fluxo único de **completar perfil** antes de usar o sistema.

## Fluxo

```text
Aprovação (RPC approve_pending_person)
        │
        ▼
ApprovePendingCollaboratorDialog → invoke('notify-approved-collaborator')
        │
        ├── DM Slack (se slack_user_id OU lookupByEmail OK)
        └── Email (Resend) com link de acesso
                │
                ▼
Usuário entra → /auth (magic link / Figma OAuth)
        │
        ▼
ProtectedRoute detecta person.profile_completed_at IS NULL
        │
        ▼
Redireciona para /complete-profile (wizard único)
        │
        └── Salva campos faltantes + marca profile_completed_at = now()
                │
                ▼
Acesso liberado ao app
```

## Mudanças

### 1. Schema (migration)

- `people.profile_completed_at timestamptz NULL` — marca conclusão do wizard.
- Backfill: `UPDATE people SET profile_completed_at = now() WHERE data_contrato IS NOT NULL AND data_nascimento IS NOT NULL;` para não forçar usuários atuais a refazer.
- `approve_pending_person` continua igual; **não** pré-preenche `profile_completed_at`, então qualquer aprovado entra no wizard.

### 2. Edge function nova: `notify-approved-collaborator`

Input: `{ person_id }`. Lê `people` (nome, email, slack_user_id se houver), determina canais:

- **Slack DM**: usa `slack_user_id` salvo no pending (propagar via approve RPC → ver item 3) ou faz `users.lookupByEmail`. Texto: "🎉 Seu cadastro foi aprovado! Acesse {APP_URL} para completar seu perfil."
- **Email**: chama `adminClient.auth.admin.inviteUserByEmail(email, { redirectTo: APP_URL + '/complete-profile' })`. Se já existe auth user, cai em `generateLink({ type: 'magiclink' })` e envia via Resend (mesmo padrão de `admin-auth-management`).

Best-effort, com log em `audit_logs` (`acao = 'NOTIFY_APPROVED'`).

### 3. Propagação de `slack_user_id` na aprovação

Hoje `approve_pending_person` lê `v_slack_user_id` mas não copia para `people`. Adicionar coluna `people.slack_user_id text NULL` (migration) e gravar no INSERT do RPC, para a DM funcionar mesmo quando o email do Slack difere do email cadastrado.

### 4. Trigger da notificação

Em `src/components/ApprovePendingCollaboratorDialog.tsx`, após a chamada bem-sucedida do RPC, invocar em paralelo:

```ts
supabase.functions.invoke('notify-approved-collaborator', { body: { person_id: result.person_id } })
```

Mantém o `slack-notification` `PERSON_APPROVED` (canal interno para diretores) intacto.

### 5. Página `/complete-profile` (nova)

Wizard único com 3 seções, todas obrigatórias antes de concluir:

1. **Dados pessoais**: data de nascimento (Date input).
2. **Cargo / time / local**: pré-preenchidos com o que veio do pending; editável; obrigatórios.
3. **Contrato**: reutiliza a UI de `ContractDateSetup` (data + modelo CLT/PJ + dia de pagamento se PJ).

Ao concluir: chama RPC `update_collaborator_onboarding_data` + `update_profile_for_current_user` + nova RPC `mark_profile_completed()` que apenas seta `profile_completed_at = now()` para o `current_person_id()`.

### 6. Roteamento

Em `ProtectedRoute.tsx`, após validar `person`, se `person.profile_completed_at IS NULL` e rota atual não for `/complete-profile`, redireciona para lá. As páginas `/setup-profile` e `/setup-contract` antigas continuam, mas o novo wizard absorve o caso "aprovado por /biscoito".

## Detalhes técnicos

- **Idempotência**: `notify-approved-collaborator` checa `audit_logs` por evento prévio para o mesmo `person_id` antes de reenviar.
- **Secrets**: já existem `SLACK_BOT_TOKEN`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — nada novo.
- **RLS**: `mark_profile_completed` é `security definer`, escopo restrito ao `auth.uid()`. Sem nova policy em `people` (update já permitido para o próprio via RPCs existentes).
- **Não altera**: feed de kudos, pontuação, vinculação retroativa de kudos pendentes (já feita no RPC), notificação para diretores via /biscoito.

## Escopo

- **Backend**: 1 migration (2 colunas + backfill), 1 RPC nova (`mark_profile_completed`), update no RPC `approve_pending_person`, 1 edge function nova.
- **Frontend**: 1 página nova (`CompleteProfile.tsx`), update em `ProtectedRoute.tsx`, update em `ApprovePendingCollaboratorDialog.tsx`, rota em `App.tsx`.
- **Não tocado**: SetupProfile/ContractDateSetup atuais (mantidos para os fluxos existentes), demais páginas.
