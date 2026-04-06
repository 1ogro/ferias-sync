
Objetivo: corrigir a exibição do menu "Gestão do Time" para todos os usuários com papel `GESTOR`.

Diagnóstico já confirmado
- O link já existe em `src/components/Header.tsx` com permissão para `GESTOR` e `DIRETOR`.
- No banco, os gestores listados têm `profiles.user_id` vinculado corretamente e `papel = 'GESTOR'`.
- Então o problema mais provável não é cadastro nem RLS; é o fluxo de carregamento de autenticação/perfil no frontend.

Causa provável
- `Header.tsx` filtra os itens pelo `person?.papel` imediatamente.
- `useAuth.tsx` faz inicialização duplicada (`getSession` + `onAuthStateChange`), repete `fetchPersonData` e ainda tem um timeout que pode disparar com estado stale.
- Resultado: o header pode decidir a navegação antes de o perfil do usuário estar estável, escondendo o menu de role.

Implementação
1. Ajustar `src/hooks/useAuth.tsx`
- Consolidar o fluxo de inicialização para evitar chamadas duplicadas de `fetchPersonData`.
- Corrigir o timeout de autenticação para não usar `loading` stale e cancelá-lo quando o perfil já tiver carregado.
- Garantir um estado confiável de “auth/profile pronto”.

2. Ajustar `src/components/Header.tsx`
- Consumir `loading`, `profileChecked` e `contractDateChecked` do `useAuth`.
- Não aplicar filtro de role enquanto o auth ainda estiver resolvendo.
- Só montar `filteredNavigation` quando o `person` estiver carregado.
- Manter a regra de visibilidade do link separada da lógica do badge de ausências.

3. Blindar a UX
- Exibir placeholder/skeleton de navegação durante o carregamento, em vez de esconder links por falta temporária de `person`.
- Aplicar a mesma lógica tanto no menu desktop quanto no mobile.

Arquivos a alterar
- `src/hooks/useAuth.tsx`
- `src/components/Header.tsx`

Sem mudanças de banco
- Nenhuma migração ou ajuste de RLS é necessária.

Validação
- Testar login com pelo menos 3 usuários `GESTOR` da lista.
- Confirmar que o menu aparece no desktop e no mobile.
- Confirmar que o link aparece mesmo para gestor sem subordinados.
- Confirmar que `COLABORADOR` não vê o menu.
- Confirmar que os logs deixam de mostrar múltiplos fetches repetidos e o `Auth initialization timeout` indevido.
