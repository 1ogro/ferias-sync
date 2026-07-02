# Seção de Peer Review no Painel de Resultados

Adicionar uma nova seção ao `PulseResultsPanel` visível apenas quando a pesquisa é do tipo `peer`, mostrando o status de cada par revisor → avaliado.

## O que aparece na tela

Quando a pesquisa for de peer review, uma nova seção "Pares de peer review" será renderizada com:

- **Cartões-resumo** ao topo: total de pares, respondidos, pendentes e taxa de conclusão (%).
- **Filtro por execução (run)**: seletor para escolher um disparo específico ou "todos".
- **Filtro por status**: "Todos", "Respondidos", "Pendentes".
- **Tabela de pares** com colunas:
  - Revisor (nome do respondente)
  - Avaliado (nome de quem está sendo avaliado)
  - Enviado em (data de envio ao Slack)
  - Lembretes (quantidade já enviada)
  - Status (badge verde "Respondido" com data, ou badge âmbar "Pendente")
- Quando a pesquisa é anônima, o nome do revisor é ocultado (mostra "Anônimo"), mantendo apenas o nome do avaliado e o status — preservando o anonimato das respostas mas ainda permitindo ao gestor identificar quem ainda falta avaliar.

## Arquivos afetados

- `src/hooks/usePulses.ts` — novo hook `usePeerReviewPairs(surveyId)` que faz `select` em `peer_review_pairs` com join nos nomes das pessoas (`people`) via duas consultas ou embed do PostgREST.
- `src/components/pulses/PulseResultsPanel.tsx` — nova subseção condicional `{survey.kind === "peer" && <PeerReviewPairsSection />}` renderizada abaixo das "Respostas recentes".
- Novo componente `src/components/pulses/PeerReviewPairsSection.tsx` contendo a UI descrita acima.

## Detalhes técnicos

- A tabela `peer_review_pairs` já tem RLS permitindo leitura ao revisor, ao avaliado e a admins/diretores; os cartões de resumo do painel são vistos por criadores/admins, então nenhuma mudança de RLS é necessária.
- Índices já existentes (`idx_peer_pairs_run`, `idx_peer_pairs_subject`, `idx_peer_pairs_reviewer`) cobrem as consultas.
- Nomes de pessoas serão buscados em um único `select id, nome from people where id in (...)` e cruzados no cliente, evitando joins caros.
- Filtro por run reutiliza a lista já carregada por `usePulseRuns`.
- Estado "Respondido" é derivado de `completed_at IS NOT NULL`.

Sem alterações de schema ou de edge functions.
