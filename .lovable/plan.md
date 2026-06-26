## Mudanças

1. **Remover o ephemeral "🍪 Abrindo o formulário…" do canal de origem.**
   - `slack-slash-biscoito` responde 200 vazio (`{}`) ao Slack. O modal abre instantaneamente via `views.open`, então o usuário não percebe ausência de ack.
   - Enviar uma DM curta no chat do app ("🍪 Abrindo o formulário do biscoito…") para o usuário que disparou o comando, via `conversations.open` + `chat.postMessage`. Best-effort: se falhar, só logar.

2. **Postar o biscoito no canal de origem após o submit.**
   - Em `slack-slash-biscoito`, voltar a guardar `origin_channel_id` no `private_metadata` (separado de `share_channel`, que continua `#time`).
   - Em `slack-interactions` (`biscoito_submit`), depois do insert, postar o card do biscoito no `origin_channel_id` sempre que ele existir e não for um DM com o próprio app (ignorar quando `origin_channel_id` começar com `D` e for o canal do bot — evita duplicar a DM do destinatário).
   - Se for um DM (`channel_id` começa com `D`), só postar lá se for diferente do DM do destinatário; na prática, postar no origin sempre que não for o próprio bot/app DM.
   - Captura erro `not_in_channel` / `channel_not_found` e loga — não quebra o fluxo.

3. **Fluxo final do `/biscoito`:**
   - **Chat do app (DM bot ↔ remetente):** "Abrindo o formulário…" + (depois) modal.
   - **Canal de origem:** card do biscoito (`🍪 Fulano deu um biscoito para Beltrano > mensagem`).
   - **DM do destinatário:** notificação privada (já implementado).
   - **#time:** se checkbox marcado (já implementado).
   - **Feed `/engagement`:** card em tempo real (já implementado).

## Validação

- Disparar `/biscoito` num canal público → não aparece "Abrindo o formulário" no canal; aparece como DM do app; após enviar, o card surge no canal.
- Disparar `/biscoito` num DM com o app → DM "Abrindo o formulário"; após enviar, card aparece no próprio DM (origin = app DM) — aceitável.
- Marcar "Postar em #time" → card aparece também em #time.
- Destinatário recebe DM independente das opções.

## Fora de escopo

- Customizar o card por canal (mesmo formato em todos).
- Botões de reação no card.