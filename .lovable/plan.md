## Mudança

No modal do `/biscoito` (`supabase/functions/slack-slash-biscoito/index.ts`), o checkbox "Postar em #{channel_name}" usa o canal de onde o comando foi disparado. Quando é via DM, vira "#directmessage" (inválido).

## Plano

1. **Fixar o canal de compartilhamento em `#time`** no modal:
   - Trocar `text: "Postar em #${channelName || "canal atual"}"` por `text: "Postar em #time"`.
   - Remover `channel_name` do `private_metadata` (não é mais usado para o label).
   - Passar `channel_id: "#time"` no `private_metadata` (Slack aceita nome do canal precedido de `#` em `chat.postMessage`).

2. **No handler `biscoito_submit`** (`supabase/functions/slack-interactions/index.ts`):
   - Quando o checkbox estiver marcado, postar em `#time` (já funciona pois lê `meta.channel_id`).
   - Se o bot não estiver no canal `#time`, capturar o erro `not_in_channel` e logar — não quebra o fluxo (DM e Feed continuam funcionando).

3. **Validação**:
   - Disparar `/biscoito` via DM e via canal qualquer → modal mostra "Postar em #time".
   - Marcar o checkbox → mensagem aparece em `#time`.
   - Não marcar → só DM + Feed.

## Fora de escopo

- Tornar o canal configurável por admin (pode virar próxima iteração se quiser).
- Permitir múltiplos canais.