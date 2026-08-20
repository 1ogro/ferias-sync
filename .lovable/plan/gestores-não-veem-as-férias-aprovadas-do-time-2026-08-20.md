# Gestores não veem as férias aprovadas do time

## Diagnóstico (verificado)

As permissões do banco estão corretas: existe política de leitura em `requests` que libera ao gestor as solicitações de quem tem `gestor_id` apontando para ele, e os gestores ativos realmente têm liderados vinculados (ex.: Bruno Salomon 10, Pedro Belsito 6, Airton Jordani 5). O problema é de frontend.

Três causas concretas:

1. **Filtro de time chega tarde (bug principal).** Em `/vacation-management`, a lista de IDs do time (`teamMemberIds`) é buscada de forma assíncrona e começa vazia. Os componentes `ApprovedVacationsExecutiveView` e `ActiveAbsencesDashboard` carregam os dados apenas quando o usuário autentica (`useEffect` dependente só de `user`) e filtram por essa lista ainda vazia — resultado: lista vazia, sem novo carregamento quando os IDs chegam.
2. **Gestor não tem a aba de Férias.** As abas liberadas para `GESTOR` são apenas `active`, `dashboard`, `medical` e `pulses`. A visão consolidada de férias aprovadas/saldos (`vacation` / `summary`) não existe para ele; sobra só o subitem dentro de "Dashboard", que é justamente o afetado pelo item 1.
3. **Card da home é só pessoal.** O card "Próximas Ausências Aprovadas" do dashboard inicial usa exclusivamente as solicitações do próprio usuário, então para o gestor ele aparece vazio mesmo com o time inteiro de férias (é a tela do print).

## Correções

1. **Recarregar quando o time chegar**
   - Em `ApprovedVacationsExecutiveView` e `ActiveAbsencesDashboard`, incluir `teamIds` nas dependências do carregamento e não renderizar "vazio" enquanto o escopo do gestor ainda não foi resolvido (estado de carregamento).
   - Em `VacationManagement`, sinalizar quando a busca de `teamMemberIds` terminou, para diferenciar "time vazio" de "ainda carregando".

2. **Aba de Férias para o gestor**
   - Incluir `vacation` (e `summary`) nas abas do gestor, com todos os dados restritos aos seus liderados, reaproveitando o mesmo escopo `teamMemberIds`. Nada de dado de outros times.

3. **Card da home com o time**
   - Para quem é gestor/gerente/diretor, o card "Próximas Ausências Aprovadas" passa a listar também as próximas ausências aprovadas dos liderados, com o nome da pessoa ao lado do tipo, mantendo as do próprio usuário no topo.

## Detalhes técnicos

- Arquivos: `src/pages/VacationManagement.tsx`, `src/components/ApprovedVacationsExecutiveView.tsx`, `src/components/ActiveAbsencesDashboard.tsx`, `src/components/Dashboard.tsx`.
- Sem migração de banco: as políticas RLS já permitem a leitura pelo gestor; o escopo do time continua sendo aplicado tanto pelo RLS quanto pelo filtro do frontend.
- Verificação: abrir `/vacation-management` autenticado como gestor e confirmar que as férias aprovadas dos liderados aparecem, e que um gestor sem liderados continua vendo lista vazia (não vê outros times).
