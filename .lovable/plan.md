## Objetivo

Quando um usuário logar via Figma e selecionar manualmente sua identidade no `SetupProfile` (porque o auto-link por email falhou), atualizar o `people.email` para o email vindo do Figma — garantindo que o cadastro reflita o email real usado na autenticação.

## Mudanças

### 1. Nova função SQL `link_profile_with_figma_email`
Função `SECURITY DEFINER` que, em uma única transação:
- Recebe `p_person_id` e `p_figma_email`
- Valida que o usuário atual está autenticado e que o `auth.users.email` bate com `p_figma_email` (evita fraude)
- Atualiza `people.email = p_figma_email` para o `person_id` selecionado
- Cria o `profiles` (user_id, person_id)
- Grava `audit_logs` com ação `FIGMA_EMAIL_INHERITED` contendo email antigo e novo
- Retorna `jsonb { success, message }`

Grants: `EXECUTE` para `authenticated`.

### 2. Frontend — `src/pages/SetupProfile.tsx`
- Quando `authProvider === 'figma'`, em vez de chamar `createProfile(personId)`, chama a nova RPC `link_profile_with_figma_email({ p_person_id, p_figma_email: user.email })`.
- Após sucesso, chama `fetchPersonData()` para recarregar e redireciona para `/`.
- Para login por email/senha, mantém o fluxo atual (`createProfile`).
- Mostra aviso no `Alert` informando que o email cadastrado será atualizado para o email do Figma.

### 3. Memory
Atualizar `mem://features/figma-oauth-login` registrando o novo comportamento de herança de email no SetupProfile.

## Detalhes técnicos

- A validação `auth.users.email = p_figma_email` é feita via `SELECT email FROM auth.users WHERE id = auth.uid()` dentro da função, protegendo contra um cliente que tente passar um email arbitrário.
- O trigger `audit_people_changes` já registrará o UPDATE em `people`; o log adicional `FIGMA_EMAIL_INHERITED` torna a intenção explícita.
- Nenhuma mudança no trigger `auto_link_figma_user` (continua tentando match automático antes do SetupProfile aparecer).
