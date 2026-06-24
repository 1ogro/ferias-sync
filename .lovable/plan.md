## Diagnóstico

A função `slack-interactions` **não recebeu nenhuma chamada** (zero logs). Isso significa que o Slack não está enviando os cliques de volta para o nosso endpoint — não é um bug de código, é configuração do app no Slack.

Quando o usuário clica em um botão (escala 1–5) ou abre o modal de texto, o Slack precisa de uma **Request URL de Interactivity** configurada apontando para a nossa edge function. Sem ela, o clique acontece na interface mas nada é POSTado.

## Plano

### 1. Configurar Interactivity no Slack App (ação manual do usuário, sem código)

No painel https://api.slack.com/apps → app `sync-ferias` → **Interactivity & Shortcuts**:

- Ativar **Interactivity** (toggle On)
- **Request URL**:
  ```
  https://uhphxyhffpbnmsrlggbe.supabase.co/functions/v1/slack-interactions
  ```
- Salvar

Não precisa reinstalar o app (não muda escopos), basta salvar a URL.

### 2. Pequenas melhorias defensivas em `supabase/functions/slack-interactions/index.ts`

Hoje a função tem dois problemas que podem atrapalhar o fluxo de pulses mesmo depois da URL configurada:

- **a)** Depois do bloco de pulses (`block_actions` com `action_id` começando com `pulse_*`), o código retorna corretamente, mas **se o `action_id` não bater com `pulse_answer:` nem `pulse_text_open:`** (ex.: variação futura), ele cai no fluxo legado de aprovação e tenta acessar `payload.actions[0].value` como `requestId` → erro silencioso. Vou adicionar um fallback que retorna 200 quando o `action_id` é desconhecido.
- **b)** O `resolveRespondent` depende de `users.info` retornar email. O escopo `users:read.email` já está concedido (vimos nos logs do dispatch), então deve funcionar — mas vou adicionar logs (`[slack-interactions] payload type`, email resolvido, person_id encontrado, upsert ok/erro) para que da próxima vez consigamos depurar em segundos sem alteração de código.
- **c)** Confirmar o ack ephemeral também para o caminho de texto (hoje só o de escala faz ack).

### 3. Validação

Após o usuário salvar a Request URL:
1. Disparar o pulse de novo.
2. Clicar em uma nota (1–5) no Slack.
3. Conferir nos logs de `slack-interactions` que apareceu `payload type: block_actions` e `respondent resolvido: <id>`.
4. Conferir na tabela `pulse_responses` que a linha foi inserida e `pulse_runs.responses_count` incrementou.

## Detalhes técnicos

- Arquivos alterados: apenas `supabase/functions/slack-interactions/index.ts` (logs e fallback). Nada de migration, nada de novos scopes, nada de frontend.
- A URL é fixa por projeto Supabase, então uma vez configurada não precisa mexer mais.
