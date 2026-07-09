## Problema

Ao enviar o modal do `/biscoito`, o kudo é registrado no feed, mas o Slack mostra "Tivemos alguns problemas de conexão. Tentar novamente?". Os logs de `slack-interactions` confirmam que a inserção ocorre ~3s após o boot da função — bem no limite (ou além) dos **3 segundos** que o Slack aguarda pelo ack de um `view_submission`. Como o ack chega tarde, o Slack considera falha e mostra o banner de erro (mesmo com kudo já salvo).

O handler `biscoito_submit` faz, de forma síncrona, tudo abaixo antes de responder `response_action: "clear"`:

1. `users.info` do remetente
2. `users.info` de cada destinatário `slack:*`
3. Lookup em `people` (sender + cada destinatário)
4. Dedup + insert em `kudos` + 2 chamadas `award_points` por destinatário
5. Post em canal(is) de origem/share (`chat.postMessage`)
6. `notifyRecipientDM` para cada destinatário (users.lookupByEmail + conversations.open + chat.postMessage)
7. `supabase.functions.invoke("kudos-notify-managers", …)`

Só o item 6 (o que gerou o log `dm skipped: users_not_found`) já custa 3 chamadas Slack; somando o resto, o ack estoura o SLA.

## Fix

Manter o mínimo síncrono para ainda poder devolver erros de validação no modal (Slack só aceita `response_action: errors` na resposta imediata), e mover todo o trabalho pós-inserção para `EdgeRuntime.waitUntil`.

### Alterações em `supabase/functions/slack-interactions/index.ts` (bloco `biscoito_submit`, linhas ~722–1064)

1. **Adiar `users.info` do remetente**: chamar `findPersonBySlackIdentity` primeiro só com `slackUserId`. Só chamar `users.info` (para obter email/nome) se não achar pelo `slack_user_id` **ou** se `pendingFrom` for verdadeiro (precisamos do email/nome para gravar no kudo e em `pending_people`). Isso corta 1 request Slack no caso comum (remetente já cadastrado com `slack_user_id`).

2. **Adiar `users.info` de destinatários `slack:*`**: mesma lógica — tentar `findPersonBySlackIdentity({ slackUserId: sUid })` primeiro; só chamar `users.info` quando `pendingTo` (precisa de email/nome para persistir).

3. **Manter síncrono**: validações + resolução mínima de destinatários + dedup + `insert` em `kudos` + `award_points`. Isso preserva o comportamento de mostrar `response_action: errors` quando algo é inválido, e garante que o kudo (e a resposta ao usuário) reflita erro real de gravação.

4. **Mover para `EdgeRuntime.waitUntil`** (fire-and-forget, após decidir a resposta):
   - `postToChannel(origin, …)` e `postToChannel(channelToPost, …)` (linhas 1019–1021)
   - Loop de DMs para cada destinatário (`notifyRecipientDM` / DM slack-only, linhas 1023–1049)
   - `supabase.functions.invoke("kudos-notify-managers", …)` (já é fire-and-forget mas o `await` implícito de `.invoke()` não bloqueia; garantir via `waitUntil` para consistência)
   - O bloco `notifyAdmins` já usa `EdgeRuntime.waitUntil` — manter.

5. **Responder `response_action: "clear"` imediatamente** após decidir sucesso, deixando o background rodar.

### Sem mudanças em

- `slack-slash-biscoito` (a abertura do modal já usa `EdgeRuntime.waitUntil`).
- Lógica de dedup, pontuação, `pending_people`, admins.
- Frontend / UI.

## Resultado esperado

- Ack do `view_submission` volta em <1s no caso comum → banner de erro do Slack some.
- Feed de kudos, DMs e posts em canal continuam funcionando (agora em background).
- O log `dm skipped: users_not_found` que já aparecia continua sendo apenas informativo — não afeta mais o UX do modal.
