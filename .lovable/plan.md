

## Plano: Corrigir datas exibidas com 1 dia a menos

### Causa raiz

Colunas como `data_nascimento`, `data_contrato`, `inicio`, `fim`, `start_date`, `end_date` são do tipo **date** no Postgres (sem hora). O Supabase retorna strings como `"2000-05-15"`. Quando o JavaScript faz `new Date("2000-05-15")`, interpreta como **meia-noite UTC**, que no fuso do Brasil (UTC-3) vira `14/05/2000 às 21:00` — um dia antes.

Já existe a função `parseDateSafely()` em `dateUtils.ts` que faz o parse correto (usando `new Date(year, month-1, day)` em horário local), mas ela não está sendo usada nos componentes.

### Solução

1. **Criar helper `formatDateSafe` em `src/lib/dateUtils.ts`**
   - Função que recebe uma string date-only e um formato, e retorna a string formatada corretamente usando `parseDateSafely` internamente.
   - Evita repetir `parseDateSafely` + `format` em cada componente.

2. **Substituir `format(new Date(dateString), ...)` por `formatDateSafe(dateString, ...)` nos seguintes arquivos** (apenas para colunas date-only):
   - `src/components/CollaboratorSummaryTable.tsx` — `data_contrato`, `data_nascimento` + corrigir `getNextAnniversary`
   - `src/components/VacationTableRow.tsx` — `data_contrato`
   - `src/components/VacationDetailsDrawer.tsx` — `data_contrato`
   - `src/components/VacationBalance.tsx` — `contract_anniversary`
   - `src/components/TeamCapacityDashboard.tsx` — `inicio`, `fim`, `period_start`, `period_end`
   - `src/components/ApprovedVacationsExecutiveView.tsx` — `start_date`, `end_date`
   - `src/components/MedicalLeaveList.tsx` — `start_date`, `end_date`

3. **Não alterar** campos com timestamp (como `approval_date`, `created_at`, `manager_approval_date`) — esses incluem fuso horário e funcionam corretamente com `new Date()`.

### Arquivos a alterar
- `src/lib/dateUtils.ts` — adicionar `formatDateSafe`
- 7 componentes listados acima — substituir chamadas de parse de datas

### Impacto
- Todas as datas date-only passarão a ser exibidas corretamente independente do fuso do navegador.
- Nenhuma mudança de banco necessária.

