

## Plano: Nova Tab "Resumo do Colaborador"

### Objetivo
Criar uma nova tab na página de Gestão de RH que consolide informações pessoais e contratuais dos colaboradores: modelo de contrato, data de contrato, aniversário de contrato, data de aniversário do colaborador e dia de recebimento (PJ).

### Abordagem
Criar um componente separado `CollaboratorSummaryTable.tsx` e adicioná-lo como nova tab no `VacationManagement.tsx`.

### Alterações

#### 1. Novo componente: `src/components/CollaboratorSummaryTable.tsx`

Tabela com as seguintes colunas:
- **Nome** - nome do colaborador
- **Modelo Contrato** - PJ, CLT, CLT Abono Livre, CLT Abono Fixo
- **Data Contrato** - data de início do contrato
- **Aniversário Contrato** - próximo aniversário (calculado a partir de `data_contrato`)
- **Data Nascimento** - data de nascimento
- **Próximo Aniversário** - próximo aniversário pessoal (calculado a partir de `data_nascimento`)
- **Dia Pagamento** - dia de recebimento PJ (10, 20 ou 30), exibido apenas para PJ

Funcionalidades:
- Busca por nome/cargo/time
- Filtros por time, modelo de contrato e dia de pagamento
- Ordenação por todas as colunas
- Exportar CSV
- Highlight de aniversários próximos (próximos 30 dias)
- Dados carregados da tabela `people` (já disponível via `allPeople` state ou query direta)

#### 2. Modificar `src/pages/VacationManagement.tsx`

- Adicionar `'summary'` ao array `tabValues`
- Adicionar nova `TabsTrigger` "Resumo do Colaborador" nas versões mobile e desktop
- Ajustar grid de `grid-cols-6` para `grid-cols-7`
- Adicionar `case 'summary'` no `renderTabContent`
- Importar o novo componente

#### 3. Busca de dados

O componente fará query direta ao Supabase (`people` table) buscando `nome, email, cargo, sub_time, modelo_contrato, data_contrato, data_nascimento, dia_pagamento, ativo` para colaboradores ativos. Os dados `data_nascimento` e `dia_pagamento` já existem na tabela.

### Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `src/components/CollaboratorSummaryTable.tsx` | Novo componente com tabela de resumo |
| `src/pages/VacationManagement.tsx` | Adicionar tab + import do componente |

