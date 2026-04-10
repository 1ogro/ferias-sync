

## Plano: Correções de inconsistências entre código e especificação (README)

### Problemas encontrados

#### 1. Enum `DAY_OFF` vs `DAYOFF` (BUG CRÍTICO)
O banco de dados usa o enum `DAYOFF` (sem underscore), mas 4 componentes fazem queries e comparações com `DAY_OFF` (com underscore). Resultado: **Day Offs nunca aparecem nos dashboards executivos, contadores do header, e dashboards de capacidade**.

**Arquivos afetados:**
- `src/components/Header.tsx` — contador de ausências ativas (linhas 49, 60)
- `src/components/ActiveAbsencesDashboard.tsx` — dashboard de ausências ativas (linhas 76, 124, 170, 309, 380)
- `src/components/TeamCapacityDashboard.tsx` — dashboard de capacidade (linhas 74, 265, 314)
- `src/components/ApprovedVacationsExecutiveView.tsx` — visão executiva (linhas 120, 331, 343, 557, 684)

**Correção:** Trocar todas as ocorrências de `'DAY_OFF'` por `'DAYOFF'` ou usar `TipoAusencia.DAYOFF` do enum TypeScript.

#### 2. CalendarView usa dados mock em vez de dados reais
`src/components/CalendarView.tsx` importa `mockRequests` de `mockData.ts`, que está vazio. O calendário nunca mostra dados reais.

**Correção:** Refatorar para buscar requests do Supabase (mesmo padrão do Dashboard).

#### 3. Dashboard `fetchActiveAbsences` incompleto
`src/components/Dashboard.tsx` (linha 126) filtra apenas `FERIAS` e `LICENCA_MATERNIDADE`, excluindo `DAYOFF` e `LICENCA_MEDICA` das ausências ativas mostradas no dashboard pessoal.

**Correção:** Adicionar `'DAYOFF'` e `'LICENCA_MEDICA'` ao filtro `.in('tipo', [...])`.

#### 4. README desatualizado
- Versão 2.0 e data de outubro 2025 — desatualizado
- Não menciona recuperação de senha via Slack DM (feature recém-implementada)
- Não menciona scope `im:write` do Slack (necessário para DMs)
- Não documenta os Slack scopes `users:read` e `users:read.email` como necessários para lookup por nome

### Resumo de alterações

| Arquivo | Tipo de alteração |
|---------|-------------------|
| `src/components/Header.tsx` | `DAY_OFF` → `DAYOFF` |
| `src/components/ActiveAbsencesDashboard.tsx` | `DAY_OFF` → `DAYOFF` |
| `src/components/TeamCapacityDashboard.tsx` | `DAY_OFF` → `DAYOFF` |
| `src/components/ApprovedVacationsExecutiveView.tsx` | `DAY_OFF` → `DAYOFF` |
| `src/components/Dashboard.tsx` | Adicionar `DAYOFF` e `LICENCA_MEDICA` ao filtro |
| `src/components/CalendarView.tsx` | Refatorar para usar Supabase em vez de mock |
| `README.md` | Atualizar versão, data e documentar Slack DM para reset de senha |

