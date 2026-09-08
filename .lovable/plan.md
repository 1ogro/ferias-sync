# Feedbacks por ciclo na aba "Feedbacks por perfil"

Adiciona, no perfil do colaborador selecionado, um bloco de ciclos (trimestre, semestre ou ano) com volume de feedbacks e médias.

## O que o gestor vê

Ao escolher um colaborador, acima da linha do tempo aparece um card "Evolução por ciclo" com:

- Um seletor de ciclo: Trimestre | Semestre | Ano.
- Uma tabela com uma linha por ciclo (ex.: 2026 T1, 2026 T2), sempre considerando **todo o histórico** da pessoa, independente do filtro de período usado na linha do tempo:
  - Total de registros no ciclo, quebrado em Kudos / Pares / Externos.
  - Média das notas de pares no ciclo (1–5), com "—" quando não houve nota.
  - Variação em relação ao ciclo anterior (setinha para cima/baixo no total e na média).
- Dois indicadores no topo do card:
  - Média de registros por ciclo (volume médio ao longo dos ciclos com histórico).
  - Média geral das notas de pares no período coberto.
- Ciclos sem nenhum registro dentro do intervalo com histórico aparecem com zero, para deixar visíveis os períodos sem acompanhamento.

O restante da aba (seletor de pessoa, gestores que já registraram, cobertura por gestor, linha do tempo) continua igual.

## Detalhes técnicos

Sem mudanças no banco: a RPC `get_person_feedback_timeline` já devolve os itens com `kind` e, para respostas de pares com nota, o valor 1–5 no campo `tag`.

- `src/hooks/useFeedbacks.ts`: novo hook `useFeedbackHistory(personId)` que chama a mesma RPC com `p_since: null` e chave de query `["feedback_timeline", personId, "all"]` (reaproveitando o cache quando o filtro já é "Tudo").
- Novo `src/components/engagement/FeedbackCyclesCard.tsx`:
  - `type Cycle = "quarter" | "half" | "year"`; função pura que mapeia `occurred_at` para a chave do ciclo e o rótulo (`2026 T2`, `2026 S1`, `2026`).
  - Agrupa os itens, conta por `kind`, calcula a média das notas a partir de `Number(tag)` quando `kind === "peer"` e o valor é numérico entre 1 e 5.
  - Preenche ciclos vazios entre o primeiro e o último ciclo com registro.
  - Renderiza os dois indicadores, a tabela (`@/components/ui/table`) e os deltas com `TrendingUp`/`TrendingDown` do lucide.
- `src/components/engagement/FeedbackProfilePanel.tsx`: renderiza o novo card logo abaixo do bloco "Gestores que já registraram feedback", apenas quando há colaborador selecionado; estados de carregando/erro reaproveitam o padrão atual.
