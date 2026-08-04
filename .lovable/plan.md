# Corrigir link de "completar perfil" que abre página em branco

## O que foi verificado

- A rota `/complete-profile` existe em `src/App.tsx` (linha 106) e **não** está dentro de `ProtectedRoute`.
- `src/pages/CompleteProfile.tsx` chama `navigate("/setup-profile")` **durante a renderização** quando não há `person` (linhas 112-115).
- `src/pages/SetupProfile.tsx` faz o mesmo: `navigate('/auth')` durante a renderização quando não há `user` (linhas 162-165).
- `src/pages/Auth.tsx` sempre redireciona para `/` após login — não existe suporte a retorno para a rota original.

Resultado: quem clica no CTA do Slack sem sessão ativa (caso mais comum, link aberto em outro navegador/celular) cai numa cadeia de navegações feitas durante o render, que o React Router não processa de forma confiável — a tela fica preta/vazia, como no print. Mesmo quando a navegação ocorre, o usuário perde o destino e cai na home após logar.

## Correção

1. **Nunca navegar durante o render**
   - `CompleteProfile`: mover os redirecionamentos para `useEffect` e, enquanto o estado de auth não estiver resolvido, exibir o loader. Sem sessão → enviar para `/auth?next=/complete-profile`. Com sessão e sem `person` → `/setup-profile?next=/complete-profile`.
   - `SetupProfile`: aplicar o mesmo padrão (redirecionar para `/auth` via `useEffect`, propagando `next`).

2. **Suporte a `?next=`**
   - `Auth.tsx`: após login (e-mail/senha, OAuth e magic link), ler `next` da querystring e navegar para lá em vez de `/`, validando que é um caminho interno (começa com `/`).
   - `SetupProfile`: ao concluir a vinculação, respeitar o `next` recebido.

3. **Fallback visível em vez de tela branca**
   - Se por algum motivo o estado ficar indefinido, `CompleteProfile` mostra um card com mensagem e botão "Ir para login", no mesmo padrão do fallback já existente em `ProtectedRoute`.

## Detalhes técnicos

Arquivos alterados: `src/pages/CompleteProfile.tsx`, `src/pages/SetupProfile.tsx`, `src/pages/Auth.tsx`.

Nada muda no banco de dados nem nas edge functions — a URL enviada pelo Slack
(`{APP}/complete-profile`, em `supabase/functions/send-registration-reminders/lib.ts`) já está correta.

Validação: abrir `/complete-profile` sem sessão (deve cair no login e voltar para a página após autenticar) e com sessão de um perfil incompleto (deve renderizar o formulário).
