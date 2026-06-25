## Diagnóstico

O erro no modal do Slack (“Tivemos alguns problemas de conexão”) acontece quando a URL de Interactivity não responde corretamente ao `view_submission` em até poucos segundos ou retorna um formato inesperado.

Os logs mostram que `slack-interactions` recebeu `view_submission`, mas caiu em:

```text
[slack-interactions] no matching handler for payload type: view_submission
```

Isso indica que a função publicada não está tratando o callback do modal `/biscoito`. Como consequência, o insert em `public.kudos` não acontece e o item não aparece no “Feed de kudos”.

## Plano

1. **Ajustar `slack-interactions` para aceitar o modal atual do `/biscoito`**
   - Tratar `payload.type === "view_submission"` quando o `callback_id` for `biscoito_submit`.
   - Também aceitar variações seguras, caso o Slack esteja enviando callback com sufixo/prefixo, por exemplo `biscoito_submit:*`.

2. **Responder ao Slack no formato correto**
   - Se houver erro de validação, retornar `response_action: "errors"` com campos específicos.
   - Se o kudo for registrado com sucesso, retornar `response_action: "clear"` rapidamente para fechar o modal sem erro de conexão.
   - Se o insert falhar, não fechar o modal como sucesso: retornar erro visível no próprio modal.

3. **Registrar no Feed de kudos**
   - Inserir o registro em `public.kudos` com:
     - `from_person_id`
     - `to_person_id`
     - `message`
     - `category`
     - `slack_channel_posted`
   - Manter a pontuação via `award_points`.
   - Manter o post no canal quando “Compartilhar” estiver marcado.

4. **Adicionar logs mínimos de auditoria**
   - Logar quando o callback recebido não bate com nenhum handler, incluindo o `callback_id`.
   - Logar quando um `/biscoito` for salvo com sucesso, sem expor dados sensíveis.
   - Logar erro real de insert para diagnóstico futuro.

5. **Publicar e validar**
   - Republicar a função `slack-interactions`.
   - Confirmar nos logs que o callback `biscoito_submit` é reconhecido.
   - Conferir que uma linha aparece em `public.kudos`.
   - Confirmar que `/engagement` mostra o item no “Feed de kudos”.

## Fora de escopo

- Alterar layout do dashboard de Engajamento.
- Mudar schema de banco.
- Recriar o slash command no Slack.