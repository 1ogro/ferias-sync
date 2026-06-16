## Diagnóstico

A função `slack-notification` é chamada corretamente do `NewRequestForm` quando uma nova solicitação é criada (passa `approverEmail` + `approverName` do gestor). Mas o código tem dois problemas que fazem a DM não chegar:

1. **Fallback silencioso para canal**: quando o `users.lookupByEmail` do Slack falha (escopo ausente, email do Slack diferente do email no `people`, etc.) e o lookup por nome também falha, a mensagem vai para o canal `SLACK_CHANNEL_APPROVALS` em vez do gestor — então a DM nunca chega, mas o sistema acha que "deu certo".
2. **Lookup por nome muito frouxo**: usa `.includes()` em vez de match exato — pode encontrar a pessoa errada ou nenhuma.

Sem logs históricos disponíveis (>7 dias) não dá para confirmar qual dos dois está disparando, mas a arquitetura atual mascara qualquer falha. Também identifiquei um gap relacionado: **quando o gestor aprova no 1º nível, o diretor não recebe nenhuma DM** para o 2º nível.

## O que será feito

### 1. Endurecer `slack-notification` para garantir DM (sem regredir comportamento atual)
- Trocar `users.list` `.includes()` por match exato em `real_name` / `display_name` / `name`.
- Adicionar log claro de qual caminho foi usado (`email_lookup_ok`, `name_lookup_ok`, `channel_fallback`) e o motivo da falha (resposta do Slack incluída no log).
- Para tipos de notificação que devem ser DM ao gestor/aprovador (`NEW_REQUEST`, `APPROVAL`, `REJECTION`, `REQUEST_INFO`), se a DM falhar, postar no canal **mencionando o email do destinatário** (ex: "⚠️ Não consegui enviar DM para `email@...` — quem aprova esta solicitação?"). Hoje vai silencioso.
- Persistir `audit_logs` com cada tentativa (`entidade='slack_notification'`, payload contendo `type`, `targetEmail`, `slackUserId`, `delivery`).

### 2. Notificar diretores quando solicitação sobe para 2º nível
- Em `Inbox.tsx`, quando a aprovação do gestor muda status para `EM_ANALISE_DIRETOR`, invocar `slack-notification` para cada diretor ativo com `type='NEW_REQUEST'` (DM individual). Hoje só o solicitante é avisado.

### 3. Endpoint de diagnóstico rápido
- Adicionar suporte a `?diagnose=true` em `slack-notification` que tenta resolver o `approverEmail` para um `slackUserId` **sem enviar mensagem** e retorna `{ found, slackUserId, method }`. Útil para verificar todos os gestores ativos de uma vez.

### 4. Verificações de escopo do bot (apenas docs no plano, não código)
- A função precisa que o Slack bot tenha `users:read` e `users:read.email`. Sem o segundo, `lookupByEmail` falha com `missing_scope` para todos os usuários. Se o diagnóstico mostrar que NENHUM email é encontrado, o caminho é o usuário reconectar o Slack com esses escopos (memória já documentada em `Slack Integration Requirements`).

## Detalhes técnicos

- Sem mudanças de schema.
- `audit_logs` reutilizado (entidade nova `slack_notification`) para rastreabilidade.
- Sem novas secrets.
- Frontend: 1 chamada adicional dentro do bloco já existente de aprovação no `Inbox.tsx`.

## Fora de escopo
- Não mexer no template de email (o email para o gestor já funciona via outro caminho).
- Não alterar `SLACK_CHANNEL_APPROVALS` — continua sendo fallback visível.
