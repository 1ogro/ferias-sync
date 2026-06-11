# Causa raiz encontrada

Testei a página `/reset-password` nas duas versões:

- **Site publicado (ferias-sync.lovable.app)**: a página **nunca chama o Supabase** para verificar o `token_hash` — fica no spinner "Verificando link de recuperação..." para sempre. O site publicado está rodando uma **versão antiga** do código, sem a lógica de verificação por `token_hash`.
- **Versão atual (preview)**: funciona corretamente — chama `/auth/v1/verify` e mostra o formulário (ou erro claro se o link for inválido).

Ou seja: todas as correções recentes (link no domínio público, token consumido só na página, etc.) estão prontas, mas **nunca foram publicadas**. A Bruna está caindo na versão antiga.

## O que será feito

1. **Pequena blindagem no código** (`src/pages/ResetPassword.tsx`):
   - Adicionar `.catch` na verificação do token para que falhas de rede nunca deixem o spinner infinito — sempre mostrar mensagem de erro com opção de voltar ao login.
2. **Publicar o app** — passo essencial. Sem publicar, nada do que foi corrigido chega aos usuários no domínio `ferias-sync.lovable.app`.
3. **Após a publicação**: reenviar o reset da Bruna pelo painel admin (o link atual dela pode já ter expirado — recovery tokens expiram em ~1h e o dela foi gerado às 19:06).

## Detalhes técnicos

- Logs do Supabase Auth confirmam: depois do `generate_link` das 19:06, nenhuma requisição `/verify` chegou ao servidor — prova de que o frontend publicado não executa `verifyOtp`.
- Teste automatizado no navegador confirmou: publicado = spinner eterno sem requisição; preview = chamada a `/auth/v1/verify` e feedback correto.
- Nenhuma mudança de banco necessária.