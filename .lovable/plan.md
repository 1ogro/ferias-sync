## Objetivo

Fazer com que os kudos disparados via **pulses de kudos** (botão "🎉 Dar kudos" no DM) sigam exatamente as mesmas regras do **/biscoito**: lista de destinatários, modal, pessoas pendentes, pontuação, notificações e compartilhamento em canal.

## Diferenças hoje

| Aspecto | /biscoito (referência) | Pulse kudos (atual) |
|---|---|---|
| Lista de destinatários | Todos os membros do Slack (não-bots, ativos), com match para `people` por email/nome | Só `people.ativo`, filtrado pelo `target_scope` da survey |
| Pessoas fora do app | Aceita; cria `pending_people` (`source=slack_biscoito`), salva `to_slack_*`/`from_slack_*` e marca `pending_*` | Bloqueia (só lista app users) |
| Pontuação | 10 pro destinatário + 2 pro remetente, **só para lados cadastrados** (creditado retroativamente na aprovação) | 10 + 2, **falha se algum lado não for app user** |
| Compartilhar em canal | Checkbox no modal + canal padrão `#time` (private_metadata) | Sem checkbox; usa `survey.kudos_channel` silenciosamente |
| Notificação de admins | DM para diretores/admins quando há lado pendente | Não existe (não há fluxo pendente) |
| DM ao destinatário | Para app users: `notifyRecipientDM`; para slack-only: DM com aviso "cadastro pendente" | Só `notifyRecipientDM` para app user |
| Notificação ao gestor | `kudos-notify-managers` quando há destinatário app | Igual |

## Mudanças

### 1. `slack-interactions/index.ts` — handler `give_kudos_open:` (modal de abertura)

Reescrever para espelhar `openModal` do `slack-slash-biscoito`:

- Paginar `users.list` (helper `listAllSlackMembers`) e construir opções `app:<person_id>` / `slack:<slack_user_id>` com dedup por email/nome normalizado.
- Filtrar o próprio sender (por slack id, email e nome).
- Respeitar `survey.kudos_categories` para limitar as opções de categoria (mantém comportamento atual).
- **Ignorar `target_scope`** para a lista do modal — o escopo da survey serve só para definir quem recebe o disparo, igual /biscoito que não tem escopo.
- Adicionar bloco `kudo_share_block` (checkbox) com canal vindo de `survey.kudos_channel` (fallback `#time`); se a survey não tiver canal definido e nem default, omitir o bloco.
- `private_metadata` = `{ survey_id, kudos_channel: <canal escolhido>, origin_channel_id: <channel do DM> }`.
- Trocar o `callback_id` continua `kudos_submit:<surveyId>` (mantém roteamento).

### 2. `slack-interactions/index.ts` — handler `view_submission` `kudos_submit:<surveyId>`

Substituir o corpo atual pela mesma lógica do bloco `biscoito_submit`:

- Resolver remetente (app user via email **OR** slack-only).
- Resolver destinatário aceitando `app:` e `slack:`.
- Validações idênticas (3-500 chars, sem auto-kudos, destinatário ativo se for app).
- Inserir em `kudos` preenchendo `from_slack_*`/`to_slack_*` e `pending_from`/`pending_to` quando aplicável.
- `awardPoints` **apenas** para lados cadastrados (igual /biscoito).
- `ensurePending` para criar/atualizar `pending_people` para lados slack-only (mesma função, mesmo `source: 'slack_biscoito'` — origem unificada, ou pode ser `slack_pulse_kudos` se preferirmos rastrear; ver "Decisões abaixo").
- Notificar admins/diretores via DM quando há novo pendente (mesmo texto, com asterisco que veio de pulse).
- Postar card no canal de share quando checkbox marcado; postar também no `origin_channel_id` apenas se não for DM (mesma guarda `startsWith("D")`).
- DM ao destinatário: app user → `notifyRecipientDM`; slack-only → DM "Você ganhou um biscoito! Cadastro pendente…".
- `kudos-notify-managers` quando há destinatário app (igual).
- `audit_logs` (`acao: KUDOS_SUBMITTED`) — já implícito via funções existentes.

### 3. Refactor mínimo

Extrair helpers comuns para o topo do arquivo `slack-interactions`:

- `listAllSlackMembers`, `pickDisplayName`, `normEmail`, `normName` — copiados de `slack-slash-biscoito` (ou movidos para `supabase/functions/_shared/slack-helpers.ts` para evitar duplicação).
- `ensurePendingPerson(supabase, { slackId, email, nome, createdBy, source })` — extraído de `biscoito_submit` e reusado em `kudos_submit`.
- `notifyAdminsPending(supabase, { lados, origin })` — idem.

Isso mantém /biscoito intacto e dá ao pulse kudos a mesma base.

### 4. Sem mudanças no front nem no schema

Os campos `from_slack_*`, `to_slack_*`, `pending_from`, `pending_to`, `source` já existem em `kudos` e `pending_people`. A página `PendingCollaboratorsList` e o RPC `approve_pending_person` já tratam o crédito retroativo dos kudos pendentes — funcionará automaticamente para os criados via pulse.

## Decisões a confirmar

1. **Origem do pending** criado por pulse: usar `source: 'slack_biscoito'` (unifica métricas, mas mistura origens) ou criar `source: 'slack_pulse_kudos'` (rastreável, mas exige checar `PendingCollaboratorsList` e o RPC para garantir que tratam o novo valor). Recomendo: **manter `slack_biscoito`** para evitar mexer no RPC e na UI.
2. **Canal de share quando `survey.kudos_channel` está vazio**: omitir o bloco do modal (sem opção de compartilhar) ou usar `#time` como /biscoito faz. Recomendo: **omitir** — o admin define o canal na survey; sem canal definido, não oferece share.

Sigo com as recomendações se você não disser o contrário.

## Escopo

- 1 arquivo principal alterado: `supabase/functions/slack-interactions/index.ts`.
- Opcional: novo `supabase/functions/_shared/slack-kudos-helpers.ts` para o refactor.
- Nenhuma migração. Nenhum arquivo de front-end. Sem mudança em `/biscoito`, `pulse-dispatch` ou `kudos-send`.
