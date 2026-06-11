## Problema

O `saveManualVacationBalance` e o `recalculateVacationBalance` chamam `.upsert()` sem informar `onConflict: 'person_id,year'`. O Supabase então tenta resolver o conflito pela primary key (`id`), e como nenhum `id` é enviado ele cria um novo registro — que bate na constraint `vacation_balances_person_id_year_key` e estoura o erro "duplicate key value". Por isso nenhuma edição manual está sendo salva.

A função `migrateManualBalances` tem o mesmo problema.

## Correções

### 1. Corrigir os upserts em `src/lib/vacationUtils.ts`
Em três pontos, trocar:
```ts
.upsert({ person_id, year, ... })
```
por:
```ts
.upsert({ person_id, year, ... }, { onConflict: 'person_id,year' })
```
Locais:
- `saveManualVacationBalance`
- `recalculateVacationBalance`
- `migrateManualBalances`

Assim o registro existente é atualizado em vez de uma nova linha ser inserida.

### 2. Ajustar os saldos pendentes de Raul Queiroz e Vanessa Adão

Hoje no banco (ano 2026):

| Pessoa | Contrato | accrued atual | accrued esperado (com aniversário 2026) |
|---|---|---|---|
| Raul Queiroz (pessoa_016) | 2018-05-11 | 210 | 240 (+30) |
| Vanessa Adão (pessoa_019) | 2022-05-01 | 90 | 120 (+30) |

Aplicar via `UPDATE` direto em `vacation_balances`:
- somar +30 a `accrued_days`
- recalcular `balance_days = accrued_days - used_days`
- acrescentar nota em `manual_justification` indicando "Ajuste aniversário de contrato 2026 aplicado manualmente em 11/06/2026"
- registrar entrada em `audit_logs` com `acao = 'ANNIVERSARY_ACCRUAL_MANUAL'` para cada pessoa (mantendo a idempotência do job diário)

### 3. Validar

Depois da migração de dados, abrir a tela de Vacation Management e confirmar:
- Raul aparece com 240 acumulados / 90 saldo
- Vanessa aparece com 120 acumulados / 61 saldo
- Editar um saldo manual qualquer e confirmar que o "duplicate key" não aparece mais

## Observações

- Não mexe no schema do banco — só correção de dados + fix nas chamadas de upsert no frontend.
- O job diário `apply-contract-anniversary-accrual` continua valendo daqui para frente; estes dois colaboradores precisaram do ajuste porque o aniversário caiu antes do job entrar em produção.
