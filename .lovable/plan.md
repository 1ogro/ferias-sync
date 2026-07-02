
## Objetivo

Permitir que usuários com papel `GESTOR` ou `DIRETOR` enviem um kudos ("biscoito") para **vários colegas de uma vez**, exclusivamente quando a categoria selecionada for **Entrega**. Nas demais categorias e para os demais papéis (`COLABORADOR`), o comportamento continua sendo 1-para-1.

Aplica-se a dois pontos de entrada:
1. App web — dialog em `src/pages/Engagement.tsx` (`GiveKudosDialog`).
2. Slack — comando `/biscoito` (`supabase/functions/slack-slash-biscoito` + submit em `supabase/functions/slack-interactions`).

## Regras

- Multi-destinatários habilitado somente quando `category === "delivery"` **e** o remetente é `GESTOR` ou `DIRETOR`.
- Mudar a categoria para outra que não seja Entrega volta o seletor a single-select e mantém apenas o 1º destinatário selecionado.
- A mesma mensagem é enviada para todos os destinatários (um kudos por destinatário registrado em `kudos`).
- Pontos: cada destinatário recebe **+10** (`kudo_received`); o remetente recebe **+2** por destinatário (`kudo_given`), mantendo a lógica atual, agora somada N vezes.
- Limite de segurança: até **10 destinatários** por envio, para evitar abuso e excesso de mensagens no Slack.
- Se "Postar em #time" estiver marcado, uma **única** mensagem consolidada é postada no canal listando todos os destinatários (evita spam).
- DM individual para cada destinatário via Slack continua (o mesmo helper `notifyRecipientDM`), disparado uma vez por destinatário.
- Notificação para gestores/diretores (`kudos-notify-managers`) é invocada uma vez por kudo criado (mantém idempotência atual).

## Mudanças por arquivo

### Frontend
- `src/pages/Engagement.tsx` (`GiveKudosDialog`)
  - Novo estado `toIds: string[]`.
  - Se `person.papel` ∈ {`GESTOR`,`DIRETOR`} e `category === "delivery"`: renderiza um seletor multi (checkbox list com busca dentro de um popover — reaproveitando `Command` + `Popover` já usados no projeto). Caso contrário, mantém o `Select` atual.
  - Ao alternar categoria para não-Entrega ou quando o papel não permite, reduz `toIds` a no máximo 1 item.
  - `submit` chama a mutação em loop `Promise.all` limitado, exibindo um toast único com contagem (`"Kudos enviado para N colegas 🎉"`).
  - Contagem visível `{toIds.length}/10` e botão desabilitado se `> 10`.

- `src/hooks/useEngagement.ts` — sem mudança no hook `useSendKudo`; adicionar util opcional `useSendKudosBatch` que reaproveita `useSendKudo` internamente (ou apenas iterar no componente). Manter simples: iterar no componente.

### Edge Functions

- `supabase/functions/kudos-send/index.ts`
  - Aceitar tanto `to_person_id: string` (compat) quanto `to_person_ids: string[]` (novo).
  - Validar: apenas se `category === "delivery"` **e** remetente é `GESTOR`/`DIRETOR` pode-se passar array > 1; caso contrário, retorna 403.
  - Limite server-side de 10 destinatários.
  - Deduplica IDs, remove o próprio remetente.
  - Insere N linhas em `kudos`, roda `award_points` para cada; `kudo_given` somado por destinatário.
  - Se `post_to_channel`: monta uma **única** mensagem listando todos os nomes.
  - Retorna `{ ok, kudos: Kudo[] }`.

- `supabase/functions/slack-slash-biscoito/index.ts`
  - Detectar se o usuário Slack (via email → `people`) é `GESTOR`/`DIRETOR`. Se sim, adicionar um bloco `checkboxes` opcional "Enviar para vários colegas" que troca o seletor.
  - Como Slack não permite trocar blocos dinamicamente sem `block_actions`, a estratégia mais simples: para gestores/diretores, o modal já inclui **ambos** os campos:
    - `kudo_to_block` (static_select single — sempre presente).
    - `kudo_to_multi_block` (multi_static_select, opcional, "Destinatários adicionais (só p/ Entrega)").
  - A validação de "só vale se category=delivery" é feita no submit em `slack-interactions`.

- `supabase/functions/slack-interactions/index.ts` (branch `kudos_submit`)
  - Coletar destinatários do `kudo_to_block` e (se existir) `kudo_to_multi_block`.
  - Consolidar em uma lista única `recipients: Array<{personId?, slackUserId?, ...}>` (mantendo a lógica atual de resolver `app:`/`slack:` para cada).
  - Se `recipients.length > 1`: exigir `category === "delivery"` e remetente `GESTOR`/`DIRETOR` (checar `people.papel`); se falhar → retornar `response_action: errors` no bloco de categoria.
  - Aplicar limite de 10.
  - Loop na lógica existente de insert + `award_points` + `notifyRecipientDM` + `ensurePendingPerson`.
  - Post no canal (quando marcado): **uma** mensagem consolidada.

## Fora de escopo

- Não altera fluxo de notificação a gestores (`kudos-notify-managers`), leaderboard, ou schema do DB.
- Não altera categorias existentes nem regras de pontuação por kudos individual.

## Diagrama do fluxo (app)

```text
[Dialog] --papel∈{GESTOR,DIRETOR} && category=delivery? --> multi-select (até 10)
                     |                                           |
                     v                                           v
              single-select (padrão)                    N × kudos-send (mesmo body)
```
