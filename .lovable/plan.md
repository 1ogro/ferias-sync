## Diagnóstico

O último disparo do survey `teste` rodou: `recipients_count=1`, `sent=0`, `status=failed`. A função retorna `ok:true` (por isso o toast de sucesso aparece), mas **nenhuma DM é enviada**. As causas mais prováveis, em ordem:

1. **`users.lookupByEmail` retorna erro** — geralmente `missing_scope` (falta `users:read.email` no bot) ou `users_not_found` (email do `people` ≠ email do Slack).
2. **`conversations.open` falha** — bot sem escopo `im:write`.
3. **Token inválido** — `SLACK_BOT_TOKEN` desatualizado / `invalid_auth`.

Os logs atuais só mostram `booted` porque os `console.warn` ficam em outro stream e o resultado é silenciosamente engolido — então não dá pra saber qual dos três é sem instrumentar.

## Plano de correção

### 1. `supabase/functions/pulse-dispatch/index.ts` — diagnóstico verboso
- Logar `auth.test` no início (mostra `team`, `bot_id`, `scopes`) para confirmar token/escopos.
- Em `lookupSlackUserByEmail`, `openIm` e `chat.postMessage`: logar payload de erro completo (`error`, `needed`, `provided`) e propagar a razão.
- `dispatchSurvey` passa a coletar por destinatário: `{ person_id, email, status: 'sent'|'no_email'|'opted_out'|'lookup_failed'|'im_failed'|'post_failed', reason? }`.
- A resposta do endpoint passa a incluir `diagnostics: [...]` por survey, além de `sent/total`.
- Gravar `diagnostics` também no `audit_logs.payload` do `DISPATCH` para inspeção posterior.

### 2. `src/hooks/usePulses.ts` — retornar diagnóstico
- `dispatchPulseNow` continua igual, apenas tipa o retorno com `results[].diagnostics`.

### 3. `src/components/pulses/PulsesTab.tsx` (ou onde o botão está)
- Após `dispatchPulseNow`, se algum recipient ≠ `sent`, mostrar toast com resumo (`X enviadas, Y falharam`) e abrir um `Dialog`/`Sheet` com a lista de falhas e o motivo. Sucesso total continua com toast simples.

### 4. Verificação após deploy
- Disparar de novo o survey `teste`.
- Ler `pulse-dispatch` logs e a coluna `audit_logs.payload` para identificar a causa real.
- Se for `missing_scope` em `users:read.email` ou `im:write`: orientar o usuário a adicionar o escopo no app Slack e reinstalar (não posso fazer isso pelo código).
- Se for `users_not_found`: o email cadastrado em `people` não bate com o do Slack do colaborador.

Sem mudanças no schema do banco nem em outras telas.