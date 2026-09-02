# Engajamento: totais por time e cobertura por gestor

## 1. Visão geral — feedbacks por time

Novo cartão "Feedbacks por time" na aba **Visão geral** (visível para gestores, gerentes, diretores e admins):

- Uma linha por sub-time com: total de feedbacks (kudos recebidos + feedbacks de pares + feedbacks externos), número de colaboradores ativos e **média de registros por colaborador**.
- Linha de totais gerais no rodapé do cartão.
- Seletor de período mensal e de escopo (Meu time / Global) igual ao já usado no relatório mensal; o escopo global fica disponível apenas para diretoria/admin.
- Times sem nenhum registro no período aparecem com zero, para evidenciar lacunas.

Colaboradores sem perfil de gestão continuam vendo a visão geral atual, sem esse cartão.

## 2. Feedbacks por perfil — quem cada gestor já avaliou

Na aba **Feedbacks por perfil**, além do resumo atual de gestores que registraram feedback para a pessoa selecionada, entra um bloco "Cobertura por gestor":

- Lista cada gestor que registrou feedback externo dentro do escopo/período, com os nomes dos colaboradores já avaliados por ele e a data do último registro por colaborador.
- Destaque para o próprio usuário ("Você"), com a lista de quem ele ainda **não** avaliou dentro do seu escopo, para evitar repetição e mostrar lacunas.
- Filtro de período reaproveita o seletor já existente do painel.

## Detalhes técnicos

- Novo RPC `get_engagement_team_summary(p_month date, p_scope text)` (security definer, grant só para `authenticated`): agrega kudos, respostas de pares e feedbacks externos por `sub_time`, retornando `sub_time`, `people_count`, `kudos`, `peer_feedbacks`, `external_feedbacks`, `total`, `avg_per_person`, respeitando o mesmo escopo de gestor já usado em `get_engagement_monthly_report`.
- Novo RPC `get_feedback_coverage_by_author(p_since timestamptz)` (security definer, grant só para `authenticated`): retorna `author_id`, `author_label`, `person_id`, `person_name`, `feedbacks`, `last_at` para feedbacks externos dentro do escopo de `get_people_in_my_feedback_scope`.
- `src/hooks/useEngagementReport.ts`: adicionar `useTeamSummary(month, scope)`.
- `src/hooks/useFeedbacks.ts`: adicionar `useFeedbackCoverage(period, since)` com chave de query estável por dia (mesmo padrão já adotado para evitar recarregamento infinito).
- `src/components/engagement/TeamSummaryCard.tsx`: novo componente do cartão por time.
- `src/components/engagement/FeedbackProfilePanel.tsx`: novo bloco de cobertura por gestor, combinando o RPC de cobertura com `useFeedbackScope`.
- `src/pages/Engagement.tsx`: renderizar o cartão de times dentro da aba Visão geral apenas para níveis de gestão.
