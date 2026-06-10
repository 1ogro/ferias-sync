## Problema

Saldos de férias armazenados em `vacation_balances` (criados por "Recalcular" ou "Migrar saldos") não recebem os +30 dias quando o aniversário de contrato chega. A função `getVacationBalance` retorna o valor gravado sem reavaliar a passagem do aniversário, e não existe nenhum job agendado que atualize esses registros.

## Solução

Criar uma **edge function diária** que, para cada pessoa ativa com `data_contrato`, verifica se hoje é o aniversário de contrato dela. Se for, garante que o registro de `vacation_balances` do ano corrente reflita o acréscimo de 30 dias (criando o registro se não existir, ou somando +30 se já existir e ainda não tiver sido contabilizado neste aniversário).

Sem backfill — passa a valer somente daqui pra frente.

## Mudanças

### 1. Nova edge function `apply-contract-anniversary-accrual`
Arquivo: `supabase/functions/apply-contract-anniversary-accrual/index.ts`

Lógica (por execução diária):
- Recebe opcionalmente `{ date: "YYYY-MM-DD", dry_run: bool }` (default = hoje em America/Sao_Paulo).
- Idempotência: consulta `audit_logs` para `entidade='vacation_balances'`, `acao='ANNIVERSARY_ACCRUAL'`, `entidade_id='<person_id>:<year>'`. Pessoas já processadas no ano são puladas.
- Busca `people` ativos com `data_contrato IS NOT NULL` cujo `(mês, dia)` == hoje.
- Para cada um:
  1. Calcula `years_completed = year - extract(year from data_contrato)`. Se ≤ 0, pula.
  2. Lê `vacation_balances` para `(person_id, year)`.
  3. Recalcula `used_days` a partir das `requests` (mesma lógica da função `recalculate_vacation_balance` no DB) — para manter consistência mesmo se houver férias realizadas no meio do ano.
  4. Se não existe registro: `INSERT` com `accrued_days = years_completed * 30`, `used_days` recalculado, `balance_days = max(0, accrued - used)`, `manual_justification = 'Acréscimo automático no aniversário de contrato'`, `updated_by = 'system'`.
  5. Se existe: faz `UPDATE` somando +30 em `accrued_days`, atualiza `used_days` recalculado, recalcula `balance_days`. Concatena na `manual_justification` a linha `[YYYY-MM-DD] +30 dias por aniversário`.
  6. Insere `audit_log` com a marca de idempotência.
- Em `dry_run`, retorna o que seria feito sem escrever.
- Retorna JSON com resumo (processados, criados, atualizados, pulados, erros).

CORS + logs estruturados. Sem `verify_jwt` (acionada por pg_cron).

### 2. Agendamento via `pg_cron` + `pg_net`
Executado pelo usuário via tool `supabase--insert` (não migration, pois contém URL + anon key específicos do projeto). SQL:

```sql
select cron.schedule(
  'apply-contract-anniversary-accrual-daily',
  '0 6 * * *', -- 03:00 America/Sao_Paulo
  $$
  select net.http_post(
    url:='https://uhphxyhffpbnmsrlggbe.supabase.co/functions/v1/apply-contract-anniversary-accrual',
    headers:='{"Content-Type":"application/json","apikey":"<ANON_KEY>"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);
```

Pré-requisito: garantir que `pg_cron` e `pg_net` estão habilitados (via migration `create extension if not exists` — só esse statement, sem dados).

### 3. UI — sem alterações
A leitura via `getVacationBalance` continua igual; o saldo correto passa a aparecer porque o registro em `vacation_balances` será atualizado pelo job.

## Validação

1. Executar a função com `{ "dry_run": true, "date": "2026-06-10" }` via `curl_edge_functions` e conferir o JSON de saída (quem seria afetado hoje).
2. Executar com `{ "date": "<aniversário de algum colaborador>", "dry_run": false }` em um colaborador conhecido e validar:
   - `vacation_balances` recebeu +30.
   - `audit_logs` tem a marca de idempotência.
   - Rodar de novo o mesmo dia → resposta indica "skipped: já processado".
3. Conferir nos logs da edge function que não houve erros.

## Fora de escopo

- Nenhum backfill retroativo (decisão do usuário).
- Sem coluna `is_manual` — todo registro em `vacation_balances` recebe o acréscimo. Se o RH quiser congelar um valor depois do acréscimo, segue editando manualmente como hoje.
- Nenhuma mudança em `getVacationBalance`, `calculateVacationBalance`, telas de Recalcular/Migrar.
