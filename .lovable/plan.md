## Objetivo
Incluir chamadas de ação (CTAs) para alternância direta entre as rotas `/engagement` e `/vacation-management?tab=pulses`, facilitando a navegação entre o feed de engajamento e a gestão de pulses.

## Contexto
- A página `/engagement` (`src/pages/Engagement.tsx`) concentra kudos, ranking, feed e preferências.
- A página `/vacation-management` (`src/pages/VacationManagement.tsx`) usa query param `tab` para abas; a aba de pulses é `tab=pulses`.
- Ambas as páginas são acessíveis a gestores, diretores e admins.
- O projeto usa React Router (`Link`/`useNavigate`) e componentes shadcn (`Button`, `Card`, `Badge`).

## Implementação

### 1. CTA em `/engagement` apontando para Pulses
- Localizar uma área de destaque no topo da página, abaixo do header e antes das grids principais.
- Adicionar um card/banner informativo com:
  - Título curto: "Gerenciar pulses" ou "Pulses de performance".
  - Descrição: "Crie, edite e dispare enquetes de engajamento."
  - Botão primário `Button asChild` com `Link to="/vacation-management?tab=pulses"`.
  - Ícone sugerido: `Settings` ou `Send` (já importados no arquivo).
- Exibir apenas para usuários com permissão (`GESTOR`, `DIRETOR` ou `is_admin`), usando o `person` do `useAuth`.

### 2. CTA em `/vacation-management` (aba pulses) apontando para Engagement
- Dentro de `PulsesTab.tsx` ou no topo da aba `pulses` em `VacationManagement.tsx`.
- Adicionar banner/card discreto com:
  - Título: "Feed de kudos" ou "Ver engajamento do time".
  - Descrição: "Acompanhe reconhecimentos e ranking."
  - Botão `Link to="/engagement"`.
  - Ícone sugerido: `Heart` ou `Sparkles`.
- Exibir para os mesmos perfis autorizados.

### 3. Tratamento de URL
- Usar query string `?tab=pulses` (o componente já lê via `useSearchParams`).
- Garantir que o link force o estado ativo correto da aba ao montar a página.

### 4. Estilo e acessibilidade
- Usar classes semânticas do Tailwind (`bg-card`, `border`, `rounded-lg`, etc.) sem hardcode de cores.
- Manter responsividade (stack em mobile, linha em desktop).
- Incluir `aria-label` descritivo no link.

## Validação
- Executar `bunx tsc --noEmit` para garantir tipagem correta.
- Verificar visualmente (se possível via preview) que os CTAs aparecem e redirecionam corretamente.
- Confirmar que usuários sem permissão (`COLABORADOR`) não veem os CTAs.

## Arquivos envolvidos
- `src/pages/Engagement.tsx`
- `src/pages/VacationManagement.tsx` ou `src/components/pulses/PulsesTab.tsx`

## Notas
- Não alterar regras de negócio, backend ou banco de dados.
- Manter consistência visual com o restante da aplicação.