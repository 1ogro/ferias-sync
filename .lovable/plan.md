

## Plano: Corrigir todas as exibições de data com offset UTC

### Problema
Diversas partes do sistema usam `new Date(string)` em strings de data `YYYY-MM-DD`, que são interpretadas como UTC meia-noite. Em fusos negativos (Brasil), isso causa deslocamento de -1 dia na exibição.

### Locais afetados e correções

#### 1. `src/lib/utils.ts` (linha 43)
- `new Date(person.data_nascimento)` → `parseDateSafely(person.data_nascimento)`

#### 2. `src/lib/medicalLeaveUtils.ts` (linhas 16-17, 24-25)
- `new Date(dbLeave.start_date)` → `parseDateSafely(dbLeave.start_date)`
- `new Date(dbLeave.end_date)` → `parseDateSafely(dbLeave.end_date)`
- `new Date(dbAlert.period_start)` → `parseDateSafely(dbAlert.period_start)`
- `new Date(dbAlert.period_end)` → `parseDateSafely(dbAlert.period_end)`

#### 3. `src/components/MedicalLeaveList.tsx` (linha 91)
- `new Date(leave.end_date)` — já recebe Date do mapper, OK se mapper for corrigido

#### 4. `src/components/Dashboard.tsx` (linhas 194-195)
- `new Date(item.inicio)` → `parseDateSafely(item.inicio)`
- `new Date(item.fim)` → `parseDateSafely(item.fim)`

#### 5. `src/pages/Inbox.tsx` (linhas 78-79, 296-297, 324-325)
- Mesmo padrão: trocar `new Date()` por `parseDateSafely()` para `inicio`/`fim`
- `toLocaleDateString` → `formatDateSafe(x, 'dd/MM/yyyy')`

#### 6. `src/pages/RequestDetail.tsx` (linhas 98-99)
- `new Date(requestData.inicio)` → `parseDateSafely(requestData.inicio)`
- `new Date(requestData.fim)` → `parseDateSafely(requestData.fim)`

#### 7. `src/components/NewRequestForm.tsx` (linhas 104-105, 296, 302, 317-318, 425-426, 665)
- Todas as instâncias de `new Date(formData.inicio)`, `new Date(formData.fim)`, `new Date(person.data_nascimento)` → `parseDateSafely()`
- `toLocaleDateString('pt-BR')` → `formatDateSafe(x, 'dd/MM/yyyy')`

#### 8. `src/pages/EditRequest.tsx` (linhas 131-132, 278-279, 499)
- Mesmo padrão: `new Date()` → `parseDateSafely()` em `inicio`, `fim`, `data_nascimento`

#### 9. `src/components/ProfileModal.tsx` (linha 150)
- `new Date(formData.data_nascimento)` → `parseDateSafely(formData.data_nascimento)`

#### 10. `src/components/VacationBalance.tsx` (linha 87-88)
- `new Date(balance.contract_anniversary)` → já usa `formatDateSafe` para exibição na linha 135, mas linhas 87-88 criam Date para cálculo — trocar por `parseDateSafely()`

### Padrão de correção
Cada arquivo receberá import de `parseDateSafely` e/ou `formatDateSafe` de `@/lib/dateUtils` (se não tiver), e substituição pontual de `new Date(stringYYYYMMDD)` por `parseDateSafely(stringYYYYMMDD)`.

**Nota**: campos com timestamp (como `created_at`, `approval_date`, `updated_at`) usam `new Date()` corretamente pois incluem hora/timezone — esses NÃO serão alterados.

### Arquivos a alterar (10 arquivos)
1. `src/lib/utils.ts`
2. `src/lib/medicalLeaveUtils.ts`
3. `src/components/Dashboard.tsx`
4. `src/components/NewRequestForm.tsx`
5. `src/components/ProfileModal.tsx`
6. `src/components/VacationBalance.tsx`
7. `src/pages/EditRequest.tsx`
8. `src/pages/Inbox.tsx`
9. `src/pages/RequestDetail.tsx`

