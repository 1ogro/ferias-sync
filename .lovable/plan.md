## Problema

O bloco Check-out no card de engajamento (home e `/engagement`) aparece vazio porque a RPC `get_pulse_checkin_averages_v2` só considera respostas dentro da semana ISO em curso (seg 20/07 → dom 26/07). Como hoje é quinta e Check-out só é coletado sex/sáb/dom, ainda não há dados nesse bucket para a semana atual — enquanto Check-in já tem 6 respostas de segunda.

## Solução

Para cada bucket independentemente, exibir a **semana ISO mais recente que tenha respostas** (em vez de forçar a semana atual). Assim:
- Check-in continua mostrando a semana atual (tem respostas de seg 20/07).
- Check-out cai automaticamente para a semana passada (sex 17/07) até que sex 24/07 comece a receber respostas.

O rótulo passa de "esta semana" para "semana de DD/MM" (data do início da semana ISO daquele bucket), deixando explícito qual janela está sendo exibida.

## Mudanças

### 1. RPC `get_pulse_checkin_averages_v2` (nova migração)

Substituir o cálculo semanal por lógica que, para cada bucket, encontra a semana ISO mais recente com respostas e agrega apenas essa semana. Novo retorno adiciona duas colunas:

```
week_checkin_avg, week_checkin_count, week_checkin_start date,
week_checkout_avg, week_checkout_count, week_checkout_start date,
month_checkin_avg, month_checkin_count,
month_checkout_avg, month_checkout_count
```

Guard (admin/diretor/gestor) e janela de 30d permanecem inalterados. `GRANT EXECUTE ... TO authenticated` reafirmado.

### 2. Hook `usePulseCheckinAverages`

Estender `PulseAveragesWindow` para incluir `week_start: string | null` no ramo `week`. Sem breaking changes nos consumidores existentes.

### 3. UI — `EngagementSummaryCard` e bloco equivalente em `/engagement`

No `ScoreBlock`:
- Substituir "N respostas · esta semana" por "N respostas · semana de DD/MM" quando `week_start` estiver presente.
- Se `week_count === 0` (nunca houve resposta naquele bucket), manter fallback "sem respostas ainda".
- Rodapé de 30d permanece igual.

Formatação de data via `formatDateSafe` (`dateUtils.ts`) para evitar drift de fuso.

## Fora do escopo

- Alterações no painel `/vacation-management?tab=pulses`.
- Comparativo entre semanas ou highlight de variação.
- Mudança na regra de classificação por dia da semana (mantida: seg–qui = check-in, sex–dom = check-out).
