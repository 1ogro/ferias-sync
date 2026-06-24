# Plano: Filtro por mês da data de contrato na tabela de saldos de férias

## Contexto
Na página `/vacation-management`, aba "Saldos de Férias", a tabela já possui filtros avançados por **Time**, **Modelo de Contrato** e **Status** (Manual/Automático). O usuário deseja filtrar os colaboradores também pelo **mês da data de contrato** (ex: todos que iniciaram em Janeiro).

## O que será feito
Adicionar um novo filtro avançado de **Mês do Contrato** na interface de filtros da tabela de saldos de férias, seguindo o padrão de multi-seleção já existente nos outros filtros. A mudança será aplicada em ambas as renderizações da tabela: mobile (via `renderTabContent`) e desktop (via `TabsContent value="vacation"`).

## Alterações técnicas

### Arquivo: `src/pages/VacationManagement.tsx`

1. **Estado do filtro**
   - Adicionar `const [selectedContractMonths, setSelectedContractMonths] = useState<string[]>([]);` junto aos demais estados de filtros.

2. **Opções de meses**
   - Criar array constante com os 12 meses: `01` a `12`, com labels em português (Janeiro, Fevereiro, ..., Dezembro).

3. **Lógica de toggle/remoção**
   - Estender `toggleFilter` para aceitar o tipo `'contractMonth'` e adicionar/remover o mês do array `selectedContractMonths`.
   - Estender `removeFilter` para remover um mês específico.
   - Atualizar `clearAllFilters` para também limpar `selectedContractMonths`.
   - Atualizar `activeFiltersCount` para incluir `selectedContractMonths.length`.

4. **Lógica de filtragem**
   - Em `filteredData`, adicionar a condição `matchesContractMonth`:
     - Se `selectedContractMonths` estiver vazio, retorna `true`.
     - Caso contrário, extrai o mês de `item.person.data_contrato` usando `parseDateSafely` e compara com os valores selecionados (com padding de dois dígitos).
     - Colaboradores sem data de contrato não aparecem quando o filtro está ativo.

5. **Interface de filtros**
   - Adicionar um novo `<Select>` de "+ Mês do Contrato" após o filtro de Status, tanto na versão mobile (dentro de `renderTabContent` para `case 'vacation'`) quanto na versão desktop (dentro do `TabsContent value="vacation"`).
   - O select exibirá os 12 meses com labels em português e valores numéricos `01` a `12`.

6. **Chips de filtros ativos**
   - Adicionar, junto aos chips existentes de Time/Contrato/Status, chips para cada mês selecionado (ex: "Mês: Janeiro"), com botão de remoção individual.

7. **Exportação CSV**
   - A exportação `exportToCSV` já itera sobre `filteredData`, portanto respeitará automaticamente o novo filtro. Nenhuma alteração necessária.

## Fora do escopo
- Não alteraremos o `CollaboratorSummaryTable` (aba "Resumo do Colaborador"), pois o usuário se referiu especificamente à tabela de gerenciamento de saldos de férias.
- Não alteraremos a estrutura do banco de dados, nem adicionaremos novos campos.
- Não alteraremos os cálculos de saldo de férias.

## Critérios de aceitação
- O usuário pode selecionar um ou mais meses no filtro "Mês do Contrato".
- A tabela exibe apenas colaboradores cuja `data_contrato` pertença aos meses selecionados.
- Colaboradores sem data de contrato são excluídos quando o filtro está ativo.
- Os chips de filtros ativos mostram os meses selecionados e permitem remoção individual.
- O botão "Limpar todos" remove também os meses selecionados.
- A exportação CSV respeita o filtro de mês.
- Funciona tanto em desktop quanto em mobile.