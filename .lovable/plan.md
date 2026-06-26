## Resumo

Adicionar `email_pessoal` em `people` e `pending_people` para servir como alias de login/contato quando o email corporativo do colaborador não bate com o cadastro no Slack. Sem mudar `email` (que continua sendo o canônico/corporativo).

## 1. Migração

Adicionar coluna em ambas as tabelas:

```sql
ALTER TABLE public.people ADD COLUMN email_pessoal text;
ALTER TABLE public.pending_people ADD COLUMN email_pessoal text;

-- Índice único parcial (permite NULL repetido, bloqueia duplicatas)
CREATE UNIQUE INDEX people_email_pessoal_unique_idx
  ON public.people (lower(email_pessoal))
  WHERE email_pessoal IS NOT NULL;
```

Atualizar RPCs:

- **`approve_pending_person`**: aceitar `p_email_pessoal text DEFAULT NULL`, copiar do pendente se não vier, gravar em `people.email_pessoal`. Bloquear se duplicado (case-insensitive).
- **`complete_own_profile`**: aceitar `p_email_pessoal text DEFAULT NULL`. Validar regex de email, lowercase/trim, unicidade. Loga `PERSONAL_EMAIL_SET` quando muda.
- **`update_profile_for_current_user`**: estender com `p_email_pessoal` opcional (mesma validação).
- **`link_profile_personal_email`**: além do match por `slack_user_id`, aceitar também quando `auth.users.email` bate com `people.email_pessoal` (caso o diretor já tenha cadastrado o email pessoal).
- Nova RPC **`admin_update_person_emails(p_person_id text, p_email text, p_email_pessoal text)`** — usada pelo Admin para editar ambos os campos com checagem de permissão (admin/diretor) e unicidade. Loga `UPDATE_EMAILS`.

## 2. Frontend

- **`NewCollaboratorForm`** — novo campo opcional "Email pessoal (opcional)" abaixo do email corporativo, com placeholder explicando o uso (login alternativo / contato Slack). Insert em `pending_people.email_pessoal`.
- **`ApprovePendingCollaboratorDialog`** — exibir e permitir editar `email_pessoal` antes de aprovar; passar como `p_email_pessoal` em `approve_pending_person`.
- **`ProfileModal`** — adicionar campo "Email pessoal" na seção de dados pessoais; usa `update_profile_for_current_user` estendido.
- **`CompleteProfile`** — campo opcional "Email pessoal" (mostrado sempre; obrigatório nunca). Passa em `complete_own_profile`.
- **Admin (pessoas)** — em `src/pages/Admin.tsx` (edição direta de people), incluir o campo e chamar `admin_update_person_emails`.

## 3. Edge functions

- **`admin-auth-management`** — incluir `targetPerson.email_pessoal` em `extraEmails` passados a `sendSlackDM` (hoje só passa o login email do auth). Para o envio de convite por email, quando o lookup Slack falhar por todos os emails, **enviar o convite/recovery para `email_pessoal`** se o corporativo não estiver cadastrado no Slack (fallback explícito antes de tentar lookup por nome).
- **`slack-interactions` / fluxos de aprovação Slack** — sem mudança imediata (continuam capturando email do Slack como `email` ou via `slack_user_id`); o diretor preenche `email_pessoal` na aprovação se quiser.

## 4. Tipagem e auditoria

- `src/integrations/supabase/types.ts` regenera automático após migração.
- `src/lib/types.ts` — adicionar `emailPessoal?: string` em `Person` e mapear no `useAuth.fetchPersonData` (snake → camel).
- Logs em `audit_logs`: `PERSONAL_EMAIL_SET`, `UPDATE_EMAILS`.

## Fora de escopo

- Não tornar `email_pessoal` obrigatório em nenhum fluxo.
- Não permitir múltiplos emails pessoais por colaborador (1:1).
- Não alterar `auto_link_figma_user` (continua só pelo `email` canônico).

## Validação

- Criar pendente com email pessoal → aprovar → conferir `people.email_pessoal` salvo e log `APPROVE_PERSON` referenciando.
- Tentar salvar dois colaboradores com mesmo `email_pessoal` → erro de unicidade amigável.
- Login com email pessoal previamente cadastrado → `SetupProfile` encontra match e `link_profile_personal_email` aceita sem exigir `slack_user_id`.
- `admin-auth-management` invite: colaborador só tem corporativo fora do Slack mas tem `email_pessoal` cadastrado no Slack → DM entregue por esse fallback.
