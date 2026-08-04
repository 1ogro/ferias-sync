# Solicitações pendentes invisíveis para a liderança + edição/cancelamento pelo colaborador

## O que foi confirmado no banco

A solicitação do Seymour (Férias, 07/08 a 21/08) está com status **"Informações Adicionais"**, e não em análise. A Caixa de Entrada só lista:

- Diretor/admin: `PENDENTE`, `EM_ANALISE_GESTOR`, `EM_ANALISE_DIRETOR`
- Gestor: apenas `EM_ANALISE_GESTOR` dos liderados diretos

Por isso ela não aparece nem para você nem para o Pedro Belsito. Duas lacunas somam-se a isso: o gestor também não vê itens em `PENDENTE`, e nenhuma notificação é disparada quando uma solicitação volta a ficar pendente de resposta.

As regras de acesso no banco já permitem que o solicitante edite (`PENDENTE`, `INFORMACOES_ADICIONAIS`) e que gestor/diretor vejam tudo. A trava atual é só de interface — exceto para cancelamento em `EM_ANALISE_*`, que precisa de ajuste no banco.

## O que será feito

### 1. Caixa de Entrada passa a mostrar tudo que está aberto

- Diretor/admin: incluir `INFORMACOES_ADICIONAIS` na lista.
- Gestor: incluir `PENDENTE` e `INFORMACOES_ADICIONAIS` dos liderados diretos.
- Itens aguardando resposta do colaborador ganham um selo "Aguardando colaborador", para o aprovador entender que a bola está do outro lado.

### 2. Colaborador pode editar e cancelar antes da aprovação

- Botão **Editar** liberado para o dono da solicitação nos status `RASCUNHO`, `PENDENTE`, `EM_ANALISE_GESTOR`, `EM_ANALISE_DIRETOR` e `INFORMACOES_ADICIONAIS`.
- Ao salvar uma edição de solicitação já em análise, ela volta ao início do fluxo (`EM_ANALISE_GESTOR`, ou `EM_ANALISE_DIRETOR` quando o gestor é diretor) e o aprovador é notificado da alteração.
- Botão **Cancelar solicitação** para o dono nos mesmos status (exceto rascunho, que continua com "Excluir rascunho"), com diálogo de confirmação e motivo — status vai para `CANCELADO`.
- Depois de aprovada, o colaborador continua sem editar/cancelar sozinho; só liderança.

### 3. Notificações revistas

- **Nova solicitação**: além do gestor, notificar por e-mail e Slack os diretores quando o gestor é o próprio diretor ou quando o colaborador não tem gestor definido — hoje, sem gestor, ninguém é avisado.
- **Solicitação editada pelo colaborador**: novo aviso ao aprovador atual (e-mail + Slack).
- **Solicitação cancelada pelo colaborador**: aviso ao gestor/diretor.
- **Comentário do solicitante** (card Acompanhamento): passa a notificar o aprovador, hoje fica só no histórico.
- Todos os avisos seguem o padrão do projeto: envio assíncrono com registro em `audit_logs`.

## Detalhes técnicos

- `src/pages/Inbox.tsx`: ampliar os filtros de status por papel e exibir o selo de aguardando colaborador.
- `src/pages/RequestDetail.tsx`: novos `canEdit` / `canCancel` para `isOwnRequest`; reutilizar `CancellationDialog`.
- `src/pages/EditRequest.tsx`: permitir edição do próprio pedido em análise, recalcular o status de reenvio e disparar a notificação de alteração.
- `src/components/NewRequestForm.tsx`: fallback de notificação para diretores quando não há gestor a notificar.
- `supabase/functions/send-notification-email` e `slack-notification`: novos tipos `REQUEST_UPDATED`, `REQUEST_CANCELLED_BY_REQUESTER` e `REQUESTER_COMMENT`.
- Migração: ampliar a política de atualização do solicitante para aceitar cancelamento e edição em `EM_ANALISE_GESTOR` / `EM_ANALISE_DIRETOR`, mantendo o bloqueio após aprovação final.
