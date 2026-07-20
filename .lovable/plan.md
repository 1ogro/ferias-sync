## Objetivo

Nos resultados de cada pulse (aba Pulses em `/vacation-management`), passar a exibir três médias em vez de apenas uma:

- **Semanal** (últimos 7 dias)
- **Mensal** (últimos 30 dias)
- **Geral** (todo o histórico da pesquisa)

Isso vale tanto para cada pergunta de escala 1–5 quanto para uma nova média consolidada da pesquisa.

## O que muda na tela

No painel `PulseResultsPanel` (aberto ao selecionar uma pulse):

1. Novo bloco no topo, ao lado dos cards de "Disparos / Destinatários / Respondentes / Taxa de resposta":
   - **Média geral da pesquisa** — média de todas as respostas de escala 1–5, com três valores lado a lado: 7d, 30d, geral. Cada valor mostra a média (x.xx / 5) e a contagem de respostas.

2. Seção "Médias por pergunta (escala 1-5)":
   - Cada pergunta passa a mostrar três colunas de média (7d, 30d, geral) em vez de uma única.
   - Contagem de respostas continua exibida ao lado de cada média.
   - Quando uma janela não tem respostas, mostra "—" com contagem 0 (sem quebrar layout).

```text
Pergunta                              7d          30d         Geral
Como você está se sentindo hoje?      4.20 (5)    4.10 (22)   4.05 (118)
```

O restante do painel (respostas recentes, exportação, peer review) não muda.

## Fora do escopo

- Não mexer no card `EngagementSummaryCard` (dashboard), que já mostra check-in/check-out em 30 dias. Se o usuário quiser depois, tratamos separado.
- Nenhuma mudança em schema, RPC, edge function ou permissões.

## Detalhes técnicos

- Alteração isolada em `src/components/pulses/PulseResultsPanel.tsx`.
- Cálculo 100% client-side sobre `responses` já carregadas por `usePulseResponses(survey.id)` — a tabela `pulse_responses` já tem `submitted_at` e `scale_value` (confirmado no schema), então basta filtrar por janela de data no `useMemo`.
- Helper local `avgInWindow(values, days | null)` que recebe pares `{ scale_value, submitted_at }` e devolve `{ avg, count }`; `days=null` = geral.
- Ajustar o `useMemo` para produzir, por `question_id`, três agregados (7d/30d/all) e um agregado global agregando todas as perguntas de `scale_1_5`.
- Sem novas dependências.
