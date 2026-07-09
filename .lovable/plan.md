## Objetivo

1. Garantir que a Melissa Cardoso receba a DM do kudo `ff5cea70…` no Slack.
2. Vincular o `slack_user_id` dela em `people` para os próximos kudos funcionarem.
3. Passar a registrar audit log da DM ao destinatário (sucesso/falha) e exibir esse status no card do feed de kudos.

## Bloqueio de dados

Preciso do **Slack User ID** (formato `U…`) da Melissa Cardoso — no sandbox o `SLACK_BOT_TOKEN` está retornando `token_revoked`, então não consigo descobrir sozinho. Alternativa: o email real dela no Slack (se for diferente de `mmachado.melissacard@rededor.com.br`), que uso via `users.lookupByEmail`.

Vou pedir isso no fim do plano. Assim que tiver, executo (1) e (2). O item (3) não depende disso e já pode ser implementado.

## Passo 1 — Enviar a DM manualmente

Edge function pontual `send-kudo-dm-backfill` (temporária) OU execução direta do `chat.postMessage` via `standard_connectors--call_gateway_connection` do meu lado, usando a mesma mensagem que o `slack-interactions` monta:

- Categoria + emoji (`CATEGORY_LABEL`)
- `*Raul Queiroz* te deu um kudo`
- `> Um grande biscoitola pra senhora pelo hotsite de infusões! Isabela e Priscila elogiaram bastante a sua apresentação. 🫶`

Após envio, grava `audit_logs` com `acao='KUDOS_RECIPIENT_DM'`, `entidade_id=<kudo_id>:<recipient_id>`, `payload={ channel, ts, backfill:true }`.

## Passo 2 — Vincular `slack_user_id`

`UPDATE public.people SET slack_user_id = '<U…>' WHERE id = 'pessoa_029';`

Via ferramenta de insert (data change), com o ID fornecido.

## Passo 3 — Audit log da DM ao destinatário + exibição no feed

### Backend — `supabase/functions/slack-interactions/index.ts`

No bloco `postBiscoitoSideEffects` (loop de DMs para destinatários), envolver cada `notifyRecipientDM` / DM slack-only com try/catch e gravar em `audit_logs`:

- `entidade='kudos'`, `entidade_id='<kudo_id>:<recipient_id>'`, `acao='KUDOS_RECIPIENT_DM'`
- `payload`: `{ kudo_id, recipient_id, status: 'sent' | 'failed' | 'no_slack_id', error?, channel?, ts? }`

Fazer o mesmo em `supabase/functions/kudos-send/index.ts` (fluxo web equivalente) para paridade — se lá também existir DM ao destinatário.

### Backend — RPC `get_kudos_feed`

Adicionar campos derivados por linha:
- `recipient_dm_status text` — `'sent' | 'failed' | 'no_slack_id' | 'pending' | null`
- `recipient_dm_error text` — nulo quando `sent`

Deriva via `LEFT JOIN LATERAL` no `audit_logs` mais recente onde `acao='KUDOS_RECIPIENT_DM'` e `entidade_id = kudo.id || ':' || kudo.to_person_id`.

Para kudos multi-destinatário (múltiplas linhas), cada linha já tem seu próprio `to_person_id`, então o join casa naturalmente.

### Frontend

- `src/hooks/useEngagement.ts` — incluir os novos campos no tipo `Kudo`.
- Componente que renderiza o card do feed de kudos (localizar em `src/pages/Engagement.tsx` ou subcomponente correspondente) — adicionar um pequeno indicador ao lado do nome do destinatário:
  - ✅ badge sutil "DM enviada" quando `sent`
  - ⚠️ badge "DM não enviada" com tooltip mostrando `recipient_dm_error` ou "Sem Slack vinculado" quando `no_slack_id` / `failed`
  - Sem badge quando `null` (kudo antigo, sem registro).

Usar tokens semânticos do design system (variantes `secondary` / `destructive` do `Badge` do shadcn).

## Detalhes técnicos

- Nenhuma migração de schema nova é necessária (uso `audit_logs` existente). Só altero a função SQL `get_kudos_feed` — isso vai via `supabase--migration`.
- O tipo `audit_logs.entidade_id` já é texto e comporta o formato composto.
- Backfill: como o kudo da Melissa é único, gravo o audit log manualmente no Passo 1; kudos históricos ficarão sem badge (esperado).

## Pergunta antes de implementar

Qual o **Slack User ID** (`U…`) da Melissa Cardoso, ou o email dela no Slack? Sem isso não consigo executar os Passos 1 e 2 — o Passo 3 (audit log + badge no feed) posso implementar em paralelo.
