# Auditoria de datas e notificações (fuso America/Sao_Paulo)

Objetivo: eliminar antecipação/postergação de eventos (aniversários, contratos, férias, pulses, kudos, lembretes) causadas por comparações em UTC ou parsing de datas com offset. Toda regra e notificação deve refletir o "hoje" em `America/Sao_Paulo` (BRT, sem DST desde 2019).

## Escopo (código a revisar)

Edge functions com dependência de data:
- `send-daily-anniversaries` (já corrigida — reavaliar consistência)
- `send-birthday-digest` (já corrigida — reavaliar)
- `send-contract-anniversary-notifications`
- `apply-contract-anniversary-accrual`
- `send-registration-reminders` + `lib.ts`
- `send-scheduled-reminders`
- `send-weekly-open-requests-digest`
- `engagement-monthly-report`
- `pulse-dispatch` (já ajustada — validar drift em cron)
- `pulse-reminders`
- `pulse-response-notify`, `pulse-export`
- `kudos-send`, `kudos-notify-managers`, `slack-slash-biscoito`, `slack-interactions`
- `sheets-import`, `sheets-import-users`, `sheets-export`, `sync-existing-integrations`

Frontend/lib:
- `src/lib/dateUtils.ts` (fonte da verdade — `formatDateSafe`, `parseDateSafely`)
- `src/lib/vacationUtils.ts`, `maternityLeaveUtils.ts`, `medicalLeaveUtils.ts`
- `src/lib/mcp/tools/list-upcoming-absences.ts`
- Componentes que exibem/filtram datas de aniversário, contrato, férias, pulses.

Banco:
- RPCs com data (`get_pulse_checkin_averages*`, quaisquer `date_trunc`, `now()` sem `AT TIME ZONE`).
- Colunas `date` vs `timestamptz` e triggers que gravam `now()`.
- Cron jobs (`pg_cron`) — validar expressões UTC vs intenção BRT.

## Método

Para cada item acima, um subagente lê o arquivo e classifica cada uso de data em uma destas categorias, produzindo um relatório com `arquivo:linha`, categoria e correção sugerida:

1. **OK** — já usa helper local (`parseDateSafely`, `AT TIME ZONE 'America/Sao_Paulo'`, `Intl.DateTimeFormat('pt-BR', { timeZone: ... })`).
2. **Risco de fuso** — usa `new Date(iso).getMonth()/getDate()/getDay()` ou `toISOString().slice(0,10)` para derivar "hoje"/"dia do evento". Corrigir com helper TZ-safe.
3. **Comparação de data como string** desalinhada (ex.: `d.toISOString()` para comparar com coluna `date`). Corrigir para YYYY-MM-DD em SP.
4. **Cron** — validar que a expressão UTC corresponde ao horário BRT desejado; documentar no comentário do job.
5. **Cálculo de janelas** (semana ISO, mês, "próximos 30 dias") — deve começar/terminar à meia-noite BRT, não UTC.

## Correções padronizadas

- Introduzir (ou consolidar) em `supabase/functions/_shared/date.ts` os helpers:
  - `todayInSP(): { y, m, d, iso, dow }`
  - `parseIsoDateParts(iso)` (já existe em daily-anniversaries — mover para shared)
  - `formatDateSP(date, opts)`
  - `startOfIsoWeekSP(date)` / `endOfIsoWeekSP(date)`
  - `startOfMonthSP(date)` / `endOfMonthSP(date)`
- Todo lugar que hoje faz `new Date().getMonth()+1` passa a chamar `todayInSP()`.
- Toda comparação `mes/dia` (aniversário natalício, aniversário de contrato, dia de pagamento PJ) usa mês/dia de SP em ambos os lados.
- Colunas `date` (ex.: `data_nascimento`, `data_admissao`) são interpretadas como "data civil" — nunca convertidas via `new Date(iso)` sem `parseIsoDateParts`.
- Cron jobs: adicionar comentário `-- BRT HH:MM` ao lado da expressão UTC; reagendar se divergentes.

## Entregáveis

1. Relatório de auditoria (chat) listando cada finding com `arquivo:linha`, categoria e ação.
2. Novo módulo `supabase/functions/_shared/date.ts` + refatoração dos consumidores.
3. Refatoração equivalente no frontend consolidando em `dateUtils.ts`.
4. Migração corrigindo cron jobs desalinhados e recalculando `next_run_at` dos surveys de pulse se necessário.
5. Validação: para cada notificação com data crítica (aniversário, contrato, pagamento PJ, lembrete, pulse, kudos semanal, digest), rodar dry-run/simulação para `hoje`, `hoje-1` e `hoje+1` em BRT e conferir que dispara no dia certo.
6. `audit_logs` com o resumo das correções.

## Fora de escopo

- Mudar regras de negócio (janelas de elegibilidade, prazos). A auditoria só corrige *quando* o gatilho ocorre, não o *que* ele faz.
- Migração de colunas `timestamp` para `timestamptz` (avaliada apenas se aparecer como causa raiz de algum finding).

Aprovar este plano dispara a fase 1 (relatório) antes de qualquer alteração de código.