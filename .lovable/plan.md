## Objetivo

Exibir o score semanal (segunda a domingo, fuso America/Sao_Paulo) dos pulses de Check-in e Check-out nos cards de engajamento da home (`EngagementSummaryCard`) e da página `/engagement`, em destaque, mantendo o score de 30 dias como informação secundária.

## Escopo

### 1. Backend — nova RPC `get_pulse_checkin_averages_v2`
Uma única RPC retornando as duas janelas (semanal + 30d), evitando duas roundtrips.

Retorno:
```
week_checkin_avg numeric, week_checkin_count bigint,
week_checkout_avg numeric, week_checkout_count bigint,
month_checkin_avg numeric, month_checkin_count bigint,
month_checkout_avg numeric, month_checkout_count bigint
```

Regras:
- Mantém o guard atual (admin, diretor ou gestor). Colaborador comum recebe zeros/nulos.
- Classificação por dia da semana em `America/Sao_Paulo`: dow 1–4 = check-in; dow 5,6,0 = check-out.
- Semanal: `submitted_at` dentro da semana ISO atual (segunda 00:00 SP → agora).
- 30d: janela móvel `now() - 30 days` (idêntica à atual).

### 2. Hook `usePulseCheckinAverages`
Estender a interface para carregar as duas janelas em uma chamada:
```ts
{ week: { checkin_avg, checkin_count, checkout_avg, checkout_count },
  month: { ... } }
```

### 3. UI — `EngagementSummaryCard` (home)
Em cada bloco (Check-in / Check-out):
- Número grande = média semanal + "/ 5".
- Linha inferior: "N respostas · esta semana".
- Rodapé discreto (texto pequeno, `text-muted-foreground`): "30d: 4.2 · 87 resp."

### 4. UI — `/engagement`
Verificar onde os scores aparecem hoje na página (se aparecem via `EngagementSummaryCard` ou bloco próprio) e aplicar o mesmo layout. Se não houver bloco de pulses lá, reutilizar o mesmo componente/estrutura para consistência.

## Detalhes técnicos

- Migração SQL nova (não altera a RPC existente para não quebrar outros consumidores; será desprezada depois se ninguém mais usar).
- `GRANT EXECUTE ... TO authenticated` na nova RPC.
- Sem novas policies ou tabelas.
- Sem alteração no fluxo de coleta de respostas (`slack-interactions` já roteia corretamente).

## Fora do escopo
- Comparativos entre semanas.
- Liberar visibilidade para colaboradores comuns.
- Alterações no painel `/vacation-management?tab=pulses`.