## Problema

O painel de pulses mostrava "próximo envio 17h45", mas o disparo saiu 18h00 — 15 minutos depois. Isso vem se repetindo semana a semana (16h30 → 16h45 → 17h00 → … → 17h45 → 18h00) porque o horário do pulse **drifta pra frente a cada execução**.

## Causa raiz (confirmada)

Em `supabase/functions/pulse-dispatch/index.ts`, quando um survey é despachado, o próximo agendamento é calculado a partir de `now()`:

```ts
const next = nextRunFromFrequency(survey.frequency, now); // now = Date.now()
```

O cron `pulse-dispatch-every-15-min` roda a cada 15 min (`*/15 * * * *`) e só pega jobs com `next_run_at <= now()`. Então:

- Semana N: `next_run_at` cai às 17h45 exatas → cron às 17h45 dispara → grava `next_run_at = 17h45 + 7d`.
- Semana N+1: `next_run_at` = 17h45. Cron mais próximo pode ser 17h45 (ok) ou 18h00 (se o tick de 17h45 atrasar/pular). Quando atrasa 15 min, grava `next_run_at = 18h00 + 7d`, e o horário nunca mais volta.

O que aconteceu hoje: o tick das 17h45 BRT não pegou o job (provavelmente porque `next_run_at` ficou marcado 20h45:15 UTC = 17h45:15 BRT, alguns segundos depois do tick), então quem despachou foi o das 18h00 BRT, gravando `next_run_at = 2026-07-31 21:00:13 UTC` (18h00:13 BRT) — que é o que o banco tem agora.

## Solução

Ancorar `next_run_at` no **horário planejado anterior** (não em `now`), com um pequeno "snap" para o próximo múltiplo de 15 min pra ficar alinhado com a granularidade do cron.

Alteração em `nextRunFromFrequency` e no call site:

```ts
// antes
const next = nextRunFromFrequency(survey.frequency, now);

// depois
const anchor = survey.next_run_at ? new Date(survey.next_run_at) : now;
const next = nextRunFromFrequency(survey.frequency, anchor);
```

Assim `next_run_at` sempre é `next_run_at_anterior + 7 dias`, sem herdar o atraso do tick de cron. O disparo continua acontecendo no primeiro tick após o horário planejado (comportamento inevitável dado o cron de 15 min), mas o horário planejado em si para de escorregar.

Guarda: se `anchor` estiver muito no passado (ex.: survey pausado e reativado), avançar em ciclos até `anchor > now` para não gerar múltiplas execuções perdidas.

## Correção retroativa

Reancorar os três surveys ativos ao horário histórico correto:

- Check-in semanal (`6a8e78a7…`) → segunda 10h15 BRT (13h15 UTC), próximo: **2026-07-27 13:15 UTC**.
- Check-out semanal (`d7937f3c…`) → sexta 17h45 BRT (20h45 UTC), próximo: **2026-07-31 20:45 UTC**.
- Kudos da semana (`cc71fbb8…`) → sexta 12h45 BRT (15h45 UTC), próximo: **2026-07-31 15:45 UTC** (já está nesse horário; não muda).

Feito via migração `UPDATE pulse_surveys SET next_run_at = … WHERE id = …`.

## Fora do escopo

- Mudança na granularidade do cron (`*/15`) — 15 min é suficiente.
- Reprocessar o run das 18h00 de hoje (já foi enviado; recolher aos poucos).
- Mudança na UI do painel de pulses (o valor exibido passa a bater sozinho depois do fix).
