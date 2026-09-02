# Relatório de engajamento mensal por perfil

Nova aba "Relatório mensal" na tela de Engajamento (para gestores, gerentes, diretores e admins), consolidando kudos, feedbacks de pares e feedbacks externos por colaborador no mês escolhido, pronta para compartilhar com a diretoria.

## O que o gestor vê

- Seletor de mês (padrão: mês anterior fechado) e escopo (meu time / global, respeitando o mesmo escopo já usado na aba de Feedbacks por perfil).
- Cartões de totais do período: kudos recebidos, kudos enviados, respostas de pares, feedbacks externos registrados e nº de pessoas com pelo menos um registro.
- Tabela por colaborador com: nome, sub-time, kudos recebidos, kudos enviados, feedbacks de pares recebidos, feedbacks externos, total e data do último registro.
- Destaque de pessoas sem nenhum feedback no mês, para o time saber onde agir.
- Lista de gestores que registraram feedback externo no período (quem contribuiu), evitando duplicidade.

## Compartilhar com a diretoria

- Botão "Exportar CSV" com a tabela completa do período.
- Botão "Copiar resumo" que gera um texto pronto (totais + destaques + pendências) para colar em Slack/e-mail para a diretoria.
- Cabeçalho com período e escopo impressos, para o print/PDF do navegador ficar autoexplicativo.

## Detalhes técnicos

**Banco (migração)**
- Nova função `get_engagement_monthly_report(p_month date, p_scope text)` (security definer, `authenticated`), que:
  - resolve o escopo do chamador reutilizando a lógica de `get_people_in_my_feedback_scope` (gestor direto → liderados; gerente → sub-time; diretor/admin → todos os ativos, ou o próprio escopo quando `p_scope = 'team'`);
  - agrega, no intervalo `[mês, mês+1)`: `kudos` recebidos e enviados, `pulse_responses` com `subject_id` = pessoa (peer) e `external_feedbacks`;
  - retorna uma linha por pessoa: `person_id`, `nome`, `sub_time`, `kudos_received`, `kudos_given`, `peer_feedbacks`, `external_feedbacks`, `total`, `last_activity_at`.
- Função auxiliar `get_engagement_monthly_contributors(p_month date, p_scope text)` retornando autor (nome) e quantidade de feedbacks externos registrados no período dentro do escopo.
- Sem novas tabelas; nenhuma alteração de RLS existente.

**Frontend**
- `src/hooks/useEngagementReport.ts`: hooks `useMonthlyReport(month, scope)` e `useMonthlyContributors(month, scope)` com chaves de query estáveis por mês (sem timestamps voláteis) e tratamento de erro com botão de nova tentativa.
- `src/components/engagement/MonthlyReportPanel.tsx`: seletor de mês/escopo, cartões de totais, tabela ordenável, destaque de pessoas sem feedback, exportação CSV e cópia do resumo.
- `src/pages/Engagement.tsx`: adiciona a terceira aba "Relatório mensal" ao bloco de abas de gestão já existente; colaboradores sem papel de gestão continuam sem abas.
- Datas formatadas com os helpers locais de `dateUtils.ts` (sem deslocamento de fuso).
