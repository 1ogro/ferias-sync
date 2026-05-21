## Diagnóstico

- A configuração do Figma no banco está ativa: `figma_enabled = true` e `figma_status = active`.
- O botão some na tela pública de login porque `useIntegrations()` lê `integration_settings` diretamente no frontend.
- A política RLS atual permite ver `integration_settings` apenas para usuários autenticados com papel `director` ou `admin`.
- Como a tela `/auth` é acessada antes do login, o usuário anônimo não consegue ler essa configuração; `integrationSettings` fica vazio e `isFigmaEnabled` vira `false`.

## Plano

1. **Corrigir a fonte da flag pública do Figma**
   - Criar uma função RPC pública e somente-leitura para retornar apenas o estado mínimo necessário do login Figma:
     - `figma_enabled`
     - `figma_status`
   - Não expor `figma_client_id`, secrets, redirect URI ou mensagens internas.

2. **Ajustar a tela de login**
   - Trocar a condição do botão em `src/pages/Auth.tsx` para usar essa RPC pública.
   - Manter a regra atual: exibir o botão apenas quando `figma_enabled=true` e status for `active` ou `configured`.
   - Se a RPC falhar, não quebrar a tela de login; apenas manter o login por email/senha visível.

3. **Preservar segurança das configurações completas**
   - Manter a tabela `integration_settings` protegida para diretores/admins.
   - Não abrir uma policy ampla na tabela inteira, para evitar expor dados de integrações.

## Arquivos/áreas afetadas

- Banco Supabase: nova função RPC pública de leitura mínima.
- `src/pages/Auth.tsx`: leitura da flag pública e exibição do botão “Entrar com Figma”.

## Resultado esperado

- O botão “Entrar com Figma” volta a aparecer em `/auth` no ambiente produtivo para usuários ainda não logados.
- A área de configurações continua restrita a diretores/admins.
- Nenhum segredo ou dado sensível de integração é exposto publicamente.