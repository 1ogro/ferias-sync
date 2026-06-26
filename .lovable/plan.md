## Resumo

1. Permitir que um colaborador faça login com email pessoal e vincule-se a um cadastro existente **sem alterar `people.email`** — a vinculação só rola se a pessoa selecionada já tiver `slack_user_id` (sinal de que passou pelo fluxo aprovado via Slack).
2. Exigir email `@rededor.com.br` em dois pontos: no `CompleteProfile` do colaborador e na aprovação do `pending_people` pelo diretor.

## 1. Vincular email pessoal via `slack_user_id`

### Migração
Criar RPC `public.link_profile_personal_email(p_person_id text)`:

- `SECURITY DEFINER`, exige `auth.uid()`.
- Falha se o user já tem profile.
- Falha se `people` selecionado: não existe, está inativo, ou `slack_user_id IS NULL` (só perfis já validados pelo fluxo Slack podem ser linkados sem conferência de email).
- Insere em `profiles(user_id, person_id)`. **Não toca em `people.email`.**
- Log em `audit_logs` (`acao = 'LINK_PERSONAL_EMAIL'`, payload com `auth_email`).

### `src/pages/SetupProfile.tsx`

- Manter dropdown atual com `get_active_people_for_signup`.
- Ao selecionar, comparar `user.email` (lower) com `people.email` da opção:
  - **Match** → fluxo atual (`createProfile` direto / `link_profile_with_figma_email` para Figma).
  - **Mismatch** → mostrar `<Alert>` "Vamos manter o email corporativo cadastrado e usar `<seu email>` apenas para login." e chamar `link_profile_personal_email`. Se a pessoa não tiver `slack_user_id`, exibir mensagem "Esse colaborador ainda não foi validado pelo Slack — peça ao diretor para aprovar primeiro."

## 2. Exigir `@rededor.com.br` em novos cadastros

### `src/pages/CompleteProfile.tsx`

- Novo campo `Email corporativo (@rededor.com.br)` (obrigatório só quando `person.email` atual **não** termina em `@rededor.com.br`).
- Validação client-side: regex `/@rededor\.com\.br$/i`, trim, lowercase, max 255.
- Estender `complete_own_profile` RPC com parâmetro opcional `p_corporate_email text`:
  - Se informado, valida regex no servidor, checa unicidade (`lower(email)` em `people` exclui o próprio), atualiza `people.email` e loga em `audit_logs` (`CORPORATE_EMAIL_SET`).
  - Se já tem `@rededor.com.br`, parâmetro é ignorado.

### `src/components/ApprovePendingCollaboratorDialog.tsx`

- Validar no submit que `formData.email` termina em `@rededor.com.br` (regex + trim). Bloquear com toast destrutivo caso contrário, exibindo o domínio esperado abaixo do input.
- Sem mudança no `approve_pending_person`; a validação do diretor já garante o domínio, e o domínio passa intacto para `p_email`.

## Fora de escopo

- Não criar tabela de aliases de email, não alterar `people.email` quando o login for por email pessoal e existir cadastro corporativo.
- Não mexer em `auto_link_figma_user` (continua linkando automaticamente quando o email do auth bate com `people.email`).

## Validação

- Logar com email pessoal, abrir `/setup-profile`, escolher uma pessoa com `slack_user_id` preenchido e email corporativo — perfil é criado, `people.email` permanece corporativo, log `LINK_PERSONAL_EMAIL` registrado.
- Mesma tela com pessoa sem `slack_user_id` → erro com instrução clara.
- `/complete-profile` para alguém com email atual `gmail.com` → campo aparece, salva só com `@rededor.com.br`.
- Aprovação de pending com email `gmail.com` → bloqueia até trocar para `@rededor.com.br`.
