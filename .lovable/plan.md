## Situação atual

Hoje, ao enviar um biscoito via `/biscoito`, o handler `biscoito_submit` em `supabase/functions/slack-interactions/index.ts`:

1. Grava o registro em `public.kudos` (aparece no Feed de Engajamento).
2. Dá pontos para quem enviou e quem recebeu.
3. Se a pessoa marcou "Compartilhar em #canal", posta a mensagem pública no canal.
4. Dispara `kudos-notify-managers` para avisar o gestor direto e diretores.

**O que NÃO acontece hoje:** o destinatário não recebe DM do app avisando que ganhou um biscoito. Se a opção "Compartilhar" não for marcada, ele simplesmente não fica sabendo pelo Slack (só veria entrando no dashboard de Engajamento).

## Plano

Enviar uma DM do app para o destinatário sempre que ele receber um biscoito, independente da opção "Compartilhar".

1. **No handler `biscoito_submit**` (`supabase/functions/slack-interactions/index.ts`):
  - Após o insert bem-sucedido em `kudos`, buscar o e-mail do destinatário em `people`.
  - Usar `users.lookupByEmail` do Slack para achar o `slack_user_id` dele.
  - Abrir um canal de DM via `conversations.open` e enviar `chat.postMessage` com:
    - Emoji + categoria
    - Nome de quem enviou
    - A mensagem original
    - Linha curta tipo "Veja seu feed em /engagement"
  - Se o lookup falhar (e-mail não bate com nenhum usuário do Slack), apenas logar — não quebrar o fluxo.
2. **Mesma cortesia no handler `kudos_submit**` (kudos enviados pelo botão dentro do Pulse) para manter consistência: também mandar DM pro destinatário.
3. **Evitar duplicidade quando o usuário marcar "Compartilhar em #time"**:
  - Postar no canal #time (visibilidade pública).
  - Continuar mandando DM (garantia de entrega individual).
  - Os dois não se sobrepõem: canal é coletivo, DM é direta.
4. **Logs**:
  - `[biscoito_submit] dm sent to <slack_user_id>` em caso de sucesso.
  - `[biscoito_submit] dm skipped: <motivo>` em caso de falha.
5. **Validação end-to-end**:
  - Enviar `/biscoito` para um colega.
  - Conferir nos logs de `slack-interactions` o `dm sent`.
  - Confirmar que a pessoa recebeu a DM do app "UX TD" no Slack.
  - Confirmar que o card aparece no Feed.

## Fora de escopo

- Mudar o layout do dashboard.
- Adicionar reações automáticas no canal.
- Permitir que o destinatário responda/agradeça pela DM (botões interativos).
- Notificações por e-mail do destinatário (não foi pedido).