## Diagnóstico
A mensagem `"/biscoito falhou porque o app não respondeu"` (`operation_timeout`) significa que o Slack não recebeu HTTP 200 do nosso endpoint em até **3 segundos**. A função atual faz, **antes** de responder:

1. `users.info` no Slack
2. 2 queries no Postgres (`people` sender + `people` lista de 100)
3. `views.open` no Slack
4. Só então retorna `200`

Em cold start de edge function isso passa fácil dos 3s → timeout.

## Correção
Reordenar para o padrão recomendado do Slack: **ack imediato + trabalho assíncrono**.

### Mudanças em `supabase/functions/slack-slash-biscoito/index.ts`
1. Verificar assinatura HMAC (rápido, fica antes do ack).
2. Capturar `trigger_id`, `user_id`, `channel_id`, `channel_name` do form.
3. **Responder `200` imediatamente** (corpo vazio ou `response_type: ephemeral` com "Abrindo formulário…").
4. Mover todo o resto (resolve email → sender → lista de people → `views.open`) para uma função `openModal()` disparada via `EdgeRuntime.waitUntil(openModal(...))` antes do `return`.
5. Se algo falhar dentro de `openModal`, enviar mensagem ephemeral via `response_url` (o Slack manda esse campo no payload do slash command e ele aceita POSTs por até 30min) explicando o erro — em vez de só logar.

### Detalhes técnicos
- `trigger_id` do Slack expira em **3 segundos**, então `views.open` precisa rodar logo após o ack — o `waitUntil` continua executando após o response, mas começa imediatamente.
- Nenhuma mudança em tabelas, em `slack-interactions` (o handler `view_submission` para `biscoito_submit` já existe e continua válido) ou no `config.toml`.
- Nenhuma mudança de UI.

## Fora do escopo
- Fila/worker separado (overkill — `waitUntil` resolve dentro do mesmo runtime e mantém o `trigger_id` válido).
- Mudanças no fluxo de submissão do modal.
