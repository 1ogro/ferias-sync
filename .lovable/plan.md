## Objetivo
Permitir que qualquer usuário do Slack dispare `/biscoito` em qualquer canal e envie um "biscoito" (kudos) a um colega — reaproveitando a infra de kudos já existente.

## Pré-requisito (configuração no Slack — usuário precisa fazer)
O app customizado do Slack do projeto (que já existe, pois `SLACK_SIGNING_SECRET` está configurado) precisa registrar o slash command:
- **Command:** `/biscoito`
- **Request URL:** `https://uhphxyhffpbnmsrlggbe.supabase.co/functions/v1/slack-slash-biscoito`
- **Short description:** "Dar um biscoito (kudos) a um colega"
- **Usage hint:** `[opcional: @colega mensagem]`
- Escopo necessário: `commands` (reinstalar o app no workspace após adicionar)

Vou entregar essa instrução no chat após o deploy.

## Nova Edge Function: `slack-slash-biscoito`
Endpoint recebe o POST `application/x-www-form-urlencoded` do Slack.

Fluxo:
1. Verifica assinatura HMAC com `SLACK_SIGNING_SECRET` (mesma lógica de `slack-interactions`).
2. Resolve o autor pelo `user_id` Slack → email via `users.info` → `people.email`. Se não encontrado, retorna mensagem ephemeral pedindo cadastro.
3. Chama `views.open` com o `trigger_id`, abrindo um modal com:
   - **Para quem?** — `external_select` (carrega lista de pessoas ativas via `options_load_endpoint` ou static_select com a lista pré-carregada de `people` ativos, excluindo o autor).
   - **Categoria** — static_select com as 5 categorias já existentes (`teamwork`, `innovation`, `delivery`, `leadership`, `customer`).
   - **Mensagem** — plain_text_input multiline (3–500 chars).
   - **Postar no canal?** — checkbox: "Compartilhar no canal `#<nome_canal_origem>`" (canal vem do `channel_id` do slash command, guardado no `private_metadata` da view).
   - `callback_id`: `biscoito_submit`
4. Responde imediatamente com `200` vazio para o slash command (modal abre via `views.open`).

## Mudanças em `slack-interactions/index.ts`
Adicionar handler `view_submission` com `callback_id === "biscoito_submit"`:
- Reaproveita a lógica já existente do bloco `kudos_submit:` (linhas 116–183):
  - Resolve sender, valida destinatário, insere em `kudos`, chama `award_points` (10 recebedor / 2 doador), opcionalmente posta no canal (lido do `private_metadata`), e invoca `kudos-notify-managers`.
- Não depende de `pulse_surveys` — canal vem do `private_metadata`.

## Fora do escopo
- Mudanças de UI no app web.
- Mudanças nas tabelas (a tabela `kudos` já tem todos os campos necessários).
- Novos pontos/categorias.

## Detalhes técnicos
- Lista de pessoas no modal: usar `static_select` populado no momento do `views.open` (limite Slack: 100 opções; se a base tiver mais, trocar por `external_select` com novo endpoint `slack-people-options` — fica de fallback documentado, não implementado agora).
- `private_metadata` JSON: `{ origin_channel_id, origin_channel_name }`.
- `verify_jwt = false` em `supabase/config.toml` (Slack não envia JWT do Supabase).
