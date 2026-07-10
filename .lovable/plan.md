## Diagnóstico

Ao enviar `/biscoito` para Pedro Belsito e Steffani Nascimento (que existem em `people` com `email_pessoal` cadastrado, mas sem `slack_user_id`):

- **Os kudos foram inseridos** (log `[biscoito_submit] inserted 2 kudo(s) from=pessoa_016`) com `to_person_id` correto — as **pontuações foram creditadas normalmente**.
- **A DM para o destinatário falhou** com `users_not_found` porque `notifyRecipientDM` só consulta `people.email` (email corporativo `@rededor.com.br`). O Slack conhece as duas pessoas pelo `email_pessoal` (hotmail/gmail). Isso gera o badge "Sem Slack vinculado" no feed.
- O erro "Tivemos alguns problemas de conexão" no modal é o ACK do Slack estourando 3s — hoje o handler ainda faz `awardPoints`, `ensurePending` e `notifyAdmins` de forma síncrona antes de responder.

Portanto o app não está tentando o `email_pessoal` no lookup do Slack (nem faz backfill do `slack_user_id`), e o handler do modal responde tarde demais em envios múltiplos.

## Mudanças

### 1. `supabase/functions/slack-interactions/index.ts` — `notifyRecipientDM`

- Buscar `email, email_pessoal, slack_user_id, nome` da pessoa.
- Se `slack_user_id` já existir, usar direto (pular `lookupByEmail`).
- Caso contrário, tentar `users.lookupByEmail` para `email` **e** `email_pessoal` (nessa ordem), aceitando o primeiro que resolver.
- Ao resolver via lookup, `UPDATE people SET slack_user_id = ...` para backfill (evita nova busca em futuros kudos).
- Só registrar `no_slack_id` quando ambos os emails falharem; incluir os emails tentados no `audit_logs`.
- Continuar registrando `no_email` só se nenhum dos dois campos estiver preenchido.

### 2. `supabase/functions/slack-interactions/index.ts` — ACK mais rápido do modal

Mover para `EdgeRuntime.waitUntil` o trabalho pós-insert que hoje bloqueia a resposta:

- `awardPoints` de cada kudo (recipient + sender).
- `ensurePending` do sender pendente e dos destinatários pendentes.
- Notificação de admins (já está em `waitUntil`, ok).

O ACK `{response_action: "clear"}` volta assim que os INSERTs de `kudos` terminam, deixando o modal fechar dentro dos 3s. Os pontos e pendências continuam sendo processados em background.

### 3. Reenvio retroativo dos 2 biscoitos

Chamar `slack-interactions` não é apropriado; em vez disso rodar uma ação one-off (via edge function pontual ou SQL + `curl_edge_functions`) que:

- Faz `users.lookupByEmail` para `pedrogiovanityf@hotmail.com` e `steffanisnascimento@gmail.com`.
- Atualiza `people.slack_user_id` de `pessoa_013` e `pessoa_023` com o ID retornado.
- Para cada kudo recente cujo `to_person_id ∈ {pessoa_013, pessoa_023}` e cujo último `audit_logs.KUDOS_RECIPIENT_DM` seja `no_slack_id` (ou inexistente): abrir DM via `conversations.open` e postar o card "🍪 Você ganhou um biscoito!" com o remetente/categoria/mensagem originais; gravar novo `audit_logs` com `status='sent'` (o feed passa a mostrar "Enviado").
- Não recriar pontuações: elas já existem em `engagement_points` para os dois kudos.

Implementação: reaproveitar as helpers já existentes (`notifyRecipientDM` corrigido). O script one-off pode ser feito ad-hoc em runtime — não precisa virar feature permanente.

## Fora de escopo

- Alterar `kudos-send` (fluxo do app UI já entrega DM pelo `kudos-notify-managers`, sem o mesmo bug).
- Redesenhar o badge "Sem Slack vinculado" no feed (basta o audit passar a `sent` que o badge muda).
- Merge de `pending_people` (fora do sintoma reportado; já tratado em conversas anteriores).

## Detalhes técnicos

- O backfill de `slack_user_id` em `people` deve ser tolerante a conflito (checar `.eq('slack_user_id', ...).maybeSingle()` antes ou aceitar erro de unique).
- Novo campo em `audit_logs.payload`: `emails_tried: [...]` para auditoria.
- Manter a interface `notifyRecipientDM(supabase, personId, ...)` — só a implementação muda.
