# Cadastro sem depender do email corporativo

## Problema

Hoje o cadastro (`/auth` → aba Criar conta) usa o fluxo padrão de signup do Supabase, que exige confirmação por email. Quando o colaborador só consegue receber email no endereço pessoal — ou quando o email corporativo `@rededor.com.br` bloqueia/atrasa a mensagem de confirmação — a conta fica criada mas não confirmada, e o login falha.

As regras de vínculo no banco já aceitam email pessoal (`can_link_profile_to_person` e `link_profile_personal_email` comparam com `people.email` **e** `people.email_pessoal`). O bloqueio está apenas na etapa de confirmação de email.

## Solução

Criar um caminho de auto-cadastro validado pelo servidor: se o email informado já estiver cadastrado no perfil do colaborador (corporativo **ou** pessoal), a conta é criada já confirmada e o usuário entra direto, sem depender de email de confirmação.

Fluxo:

```text
usuário escolhe seu nome + informa email + senha
        |
        v
função de servidor valida: pessoa ativa? email == people.email ou people.email_pessoal?
        |-- não  -> erro claro ("peça ao administrador para cadastrar seu email pessoal")
        |-- sim  -> cria usuário já confirmado + vincula profile + registra audit log
                     |
                     v
              login automático no app
```

Se o email informado não constar no cadastro do colaborador, o comportamento atual (signup normal com confirmação por email) é mantido, para não abrir brecha de vínculo indevido.

## Alterações

1. **Nova Edge Function `self-signup`** (pública, sem JWT):
   - Valida entrada (person_id, email, senha) com Zod.
   - Com service role: busca a pessoa; exige `ativo = true` e email igual a `people.email` ou `people.email_pessoal` (case-insensitive).
   - Recusa se a pessoa já tiver `profile` vinculado, ou se o email já pertencer a outro usuário (nesse caso orienta a fazer login / recuperar senha).
   - Cria o usuário com `email_confirm: true` e insere o vínculo em `profiles`.
   - Grava `audit_logs` com ação `SELF_SIGNUP_CONFIRMED` e o método de match (corporativo/pessoal).

2. **`src/pages/Auth.tsx`**: o submit do cadastro chama a nova função; em caso de sucesso faz `signIn` automático e redireciona. Se a função responder que o email não confere com o cadastro, cai no fluxo atual de `signUp` com aviso de confirmação por email. Mensagens de erro em português, orientando procurar o administrador quando o email pessoal não estiver cadastrado.

3. **`src/pages/SetupProfile.tsx`**: sem mudanças de regra; continua funcionando para contas OAuth/Figma.

## Detalhes técnicos

- A função usa `SUPABASE_SERVICE_ROLE_KEY` (já disponível no ambiente das Edge Functions) e `corsHeaders` do SDK.
- Nenhuma migração de banco é necessária — as políticas RLS e as RPCs de vínculo já contemplam `email_pessoal`.
- A confirmação automática fica restrita a emails previamente cadastrados por um administrador no registro da pessoa; não é habilitado auto-confirm global do projeto.
