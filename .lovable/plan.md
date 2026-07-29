## Diagnóstico confirmado

- Ariana (`pessoa_037`) já tem uma linha em `public.profiles` vinculada ao auth user `81eb6fdd-7c87-46be-8e90-4c40ee7674c7`, criada em `2026-07-29 12:48:11 UTC`.
- O erro anexado acontece quando o app tenta criar `profiles` pelo cliente em `/setup-profile` e a política de criação exige que o email do JWT seja igual ao `people.email` ativo.
- A política atual de `profiles` não permite criação por `email_pessoal`; isso quebra casos em que o usuário entra por email pessoal ou quando o fluxo cai indevidamente no setup mesmo já havendo vínculo.
- O convite via Slack gerou o usuário e o profile, mas depois a UI ainda oferece o caminho de `createProfile`, que bate na RLS em vez de recuperar/validar o vínculo existente.

## Plano

### 1. Destravar a Ariana agora
- Revalidar a linha atual de `profiles` da Ariana.
- Se necessário, recriar/normalizar o vínculo `profiles.user_id -> pessoa_037` usando operação administrativa segura.
- Registrar o ajuste em `audit_logs` com motivo claro.

### 2. Corrigir a regra de RLS de `profiles`
- Ajustar as políticas de criação/atualização de `profiles` para aceitar vínculo quando o email autenticado bater com:
  - `people.email` corporativo; ou
  - `people.email_pessoal`, quando preenchido.
- Manter a exigência de `people.ativo = true`.
- Manter leitura restrita ao próprio usuário e admins.
- Não abrir `profiles` publicamente.

### 3. Corrigir o fallback do `/setup-profile`
- Em `createProfile`, antes de tentar inserir, buscar se já existe `profiles` para o `user.id` atual.
- Se existir, tratar como sucesso e recarregar os dados do colaborador.
- Se a inserção falhar por RLS mas um vínculo válido já existir para o usuário, tratar como sucesso em vez de bloquear.
- Manter log estruturado para erros reais.

### 4. Fortalecer o convite admin
- No `admin-auth-management`, conferir erros do `upsert` de `profiles` no envio de convite; hoje o código não interrompe nem reporta se o vínculo falhar.
- Em convite Slack/email, garantir que o link enviado use domínio/rota consistentes e que o profile seja criado antes de avisar sucesso.

### 5. Verificação
- Consultar `profiles` e `auth.users` da Ariana após a correção.
- Validar que a política permite criação quando o email autenticado bate com corporativo ou pessoal, e bloqueia outros emails.
- Confirmar que o app deixa de tentar recriar profile quando o vínculo já existe.

## Fora de escopo

- Não alterar permissões de admin/diretor.
- Não mudar fluxo de roles.
- Não mexer em outras políticas/tabelas além do necessário para `profiles` e o fluxo de convite/setup.