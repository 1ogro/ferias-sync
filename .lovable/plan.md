# Fluxo de aprovação para alteração de dia de pagamento (PJ)

## Situação atual

Hoje, no `ProfileModal`, quando um colaborador PJ clica em **"Solicitar alteração"** do dia de pagamento:

- Um email é enviado a todos os diretores (`get_director_emails` + `send-notification-email` tipo `PAYMENT_DAY_CHANGE_REQUEST`).
- Uma notificação Slack é disparada (`slack-notification` tipo `PAYMENT_DAY_CHANGE_REQUEST`).
- **Nada é persistido**: não há registro da solicitação, não há estado "pendente", não há aprovação/rejeição, não há histórico e o diretor precisa entrar no Admin e editar manualmente o campo `dia_pagamento` para efetivar.

Ou seja, **não existe fluxo de aprovação real** — apenas um aviso informal.

## O que criar

Fluxo completo de aprovação com estado persistido, aprovação/rejeição em 1 clique pelo diretor e aplicação automática da mudança quando aprovada.

### 1. Banco (migração)

Nova tabela `payment_day_change_requests`:

- `person_id` (FK people)
- `current_day`, `requested_day` (int, 10/20/30)
- `status` — `PENDENTE` | `APROVADO` | `REJEITADO` | `CANCELADO`
- `justification` (texto opcional que o colaborador informa)
- `reviewed_by` (person_id do diretor), `reviewed_at`, `review_notes`
- `effective_from` (data em que o novo dia passa a valer — default próximo ciclo)
- timestamps padrão + trigger `updated_at`

RLS/GRANTs:
- Colaborador vê/cria/cancela apenas as próprias solicitações pendentes.
- Diretores/admin veem tudo e aprovam/rejeitam.

Regra: só uma solicitação `PENDENTE` por pessoa (índice único parcial).

Duas funções `SECURITY DEFINER`:
- `request_payment_day_change(p_requested_day, p_justification)` — valida PJ, cria a linha, retorna id.
- `review_payment_day_change(p_id, p_approve, p_notes)` — só admin/diretor; se aprovado, atualiza `people.dia_pagamento`, grava audit log, marca `reviewed_*`.

### 2. Frontend

**`ProfileModal.tsx`** (colaborador PJ):
- Substituir o botão atual por chamada à RPC `request_payment_day_change` + campo opcional de justificativa.
- Mostrar badge "Solicitação pendente: dia X" enquanto houver uma aberta, com botão "Cancelar solicitação".
- Manter os disparos de email/Slack existentes, apenas incluindo o `request_id`.

**Inbox do diretor (`src/pages/Inbox.tsx`)**:
- Nova seção/aba "Alterações de dia de pagamento" listando solicitações `PENDENTE`.
- Ações **Aprovar** / **Rejeitar** (com nota), chamando `review_payment_day_change`.
- Ao aprovar, dispara notificação (email + Slack) ao colaborador via edge functions existentes (novo tipo `PAYMENT_DAY_CHANGE_DECISION`).

**Admin (`src/pages/Admin.tsx`)**:
- Ao lado do campo `dia_pagamento`, mostrar aviso se existir solicitação pendente e link para a inbox.

### 3. Notificações

Reaproveitar `send-notification-email` e `slack-notification` adicionando o tipo `PAYMENT_DAY_CHANGE_DECISION` (aprovada/rejeitada) com o resultado e a nota do revisor.

## Detalhes técnicos

- Aprovação atualiza `people.dia_pagamento` dentro da própria função SQL (transação única) e grava `audit_logs` com `acao='PAYMENT_DAY_CHANGE_APPROVED'` / `REJECTED`.
- Cancelamento pelo colaborador permitido apenas em `PENDENTE`.
- Emails/Slack seguem o padrão fire-and-forget já usado no projeto.

## Fora de escopo

- Alteração de `dia_pagamento` para CLT (campo só existe para PJ).
- Alterações em massa por RH.
