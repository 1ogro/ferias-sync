# Pedidos sobrepostos e pedidos parados em "Informações Adicionais"

## Diagnóstico confirmado

O Seymour tem dois pedidos abertos, criados separadamente:

- **07/08–21/08** (criado em 11/06): o diretor pediu informações adicionais em 11/06 e o pedido ficou em `INFORMACOES_ADICIONAIS` desde então, sem resposta.
- **14/08–28/08** (criado em 04/08): aprovado pelo gestor e hoje em `EM_ANALISE_DIRETOR`.

Não é duplicação técnica: ele abriu um pedido novo em vez de responder o antigo. Hoje o sistema não avisa sobre sobreposição de datas do mesmo solicitante nem cobra pedidos parados aguardando resposta.

## Parte 1 — Resolver o caso do Seymour

- Cancelar o pedido de 07/08–21/08 (status `CANCELADO`), registrando em `approvals`/`audit_logs` o motivo: substituído pelo pedido de 14/08–28/08.
- Manter o pedido de 14/08–28/08 seguindo o fluxo normal de aprovação do diretor.

## Parte 2 — Prevenir no produto

### 2.1 Aviso de sobreposição na criação/edição

- Ao criar ou editar uma solicitação, verificar se o solicitante já tem outra solicitação em aberto (`PENDENTE`, `EM_ANALISE_GESTOR`, `EM_ANALISE_DIRETOR`, `INFORMACOES_ADICIONAIS`) ou aprovada com período que se sobreponha.
- Se houver, mostrar um alerta bloqueante com as opções: **substituir** (cancela a anterior automaticamente ao enviar) ou **voltar e editar a existente**. Sem sobreposição, nada muda no fluxo.
- Na tela de detalhe e na Caixa de Entrada, pedidos sobrepostos ganham um selo de aviso para o aprovador.

### 2.2 Lembretes de pedidos parados

- Novo job diário que percorre solicitações em `INFORMACOES_ADICIONAIS` sem atualização há mais de 3 dias e envia lembrete ao solicitante (e-mail + Slack DM), respeitando as preferências de notificação.
- A partir de 15 dias parados, o lembrete também vai para o aprovador que pediu a informação, sinalizando o pedido como "abandonado" na Caixa de Entrada.
- Cada envio registrado em `audit_logs` com trava de idempotência por dia, no padrão dos demais jobs.

## Detalhes técnicos

- Dados: `UPDATE requests` do pedido antigo para `CANCELADO` + registro em `approvals` e `audit_logs`.
- `src/lib/requestOverlap.ts` (novo): consulta de solicitações conflitantes por `requester_id` e intervalo de datas.
- `src/components/NewRequestForm.tsx` e `src/pages/EditRequest.tsx`: checagem antes do envio e diálogo de substituição.
- `src/pages/Inbox.tsx` e `src/pages/RequestDetail.tsx`: selos de "sobreposto" e "aguardando colaborador há N dias".
- `supabase/functions/send-stale-request-reminders/index.ts` (nova função) + entrada no cron, usando os helpers de data em fuso SP e `getPrefs`/`sendSlackDM` de `_shared/notify-helpers.ts`.
- `supabase/functions/send-notification-email` e `slack-notification`: novo tipo `REQUEST_INFO_PENDING_REMINDER`.
- `src/lib/notificationsCatalog.ts`: cadastrar a nova notificação no painel.
