# Engajamento: duas abas + correção do carregamento infinito dos feedbacks

## O que muda para o usuário

1. A tela de Engajamento passa a ter duas abas no topo:
   - **Visão geral** — pontos, rankings, resumo de pulses e feed de kudos (tudo que já existe hoje).
   - **Feedbacks por perfil** — o painel de feedbacks por pessoa (kudos, pares e feedbacks externos), visível apenas para gestores, gerentes, diretores e admins.
2. Os feedbacks de uma pessoa param de "carregar eternamente" e passam a exibir a linha do tempo (ou uma mensagem de erro clara, se a consulta falhar).

## Causa do carregamento infinito

No painel de feedbacks, o filtro de período é convertido em uma data/hora exata a cada renderização (`sinceIso(period)` usa o horário atual em milissegundos). Esse valor entra na chave da consulta, então a cada render o React Query entende que é uma consulta nova, descarta a anterior e recomeça — o estado nunca sai de "carregando".

## Mudanças técnicas

- `src/components/engagement/FeedbackProfilePanel.tsx`
  - Estabilizar o recorte de período: calcular a data com `useMemo` dependendo apenas de `period` e usar granularidade de dia (início do dia), eliminando o valor novo a cada render.
  - Passar `period` como parte da chave da consulta em vez do timestamp cru.
  - Tratar estado de erro: quando a consulta falhar, mostrar mensagem com o motivo e botão de tentar novamente, em vez de lista vazia ou spinner.
  - Corrigir também o `id` usado nas ações de feedback externo (prefixo `ext:` vindo do banco) para garantir exclusão e alternância de visibilidade corretas.
- `src/hooks/useFeedbacks.ts`
  - `useFeedbackTimeline` passa a receber `period` (chave estável) + a data calculada, e expõe `error`/`refetch`.
- `src/pages/Engagement.tsx`
  - Envolver o conteúdo em `Tabs` com as abas "Visão geral" e "Feedbacks por perfil"; a segunda aba só aparece para quem tem escopo de gestão. O conteúdo atual (cards de pontos, rankings, kudos, atalho de pulses) vai para a primeira aba, sem alteração de comportamento.

Nenhuma mudança de banco de dados é necessária.
