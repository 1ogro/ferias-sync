# Corrigir kudos multiplicados no Slack

## Diagnóstico

Cada kudo enviado dispara `kudos-notify-managers` uma vez, e essa função manda 1 DM para o gestor direto do destinatário + 1 DM para **cada diretor ativo**. Quando um gestor/diretor envia um kudo coletivo (categoria "delivery") para N pessoas, o `kudos-send` invoca a função N vezes — resultado: cada diretor recebe N DMs quase idênticas em segundos. Os logs de `audit_logs` confirmam o padrão (ex.: 3 kudos disparados em 17:25:13 geraram 3 DMs seguidas para o mesmo diretor).

## Solução

Consolidar kudos coletivos em **uma única DM por notificado**, mantendo gestor direto + diretores como público-alvo.

### Alterações

**1. `supabase/functions/kudos-send/index.ts`**
- Substituir o loop atual `for (const k of insertedKudos) invoke("kudos-notify-managers", { kudo_id })` por **uma única invocação** passando `{ kudo_ids: [...] }` quando `insertedKudos.length > 1`. Kudo único continua enviando `{ kudo_id }` (compatibilidade).

**2. `supabase/functions/slack-interactions/index.ts`**
- No handler do modal `biscoito_submit` (linha ~1027), aplicar o mesmo agrupamento: se o modal inseriu múltiplos kudos na mesma submissão, invocar `kudos-notify-managers` uma vez com `{ kudo_ids: [...] }`.
- O handler `kudos_submit` individual (linha ~710) permanece igual.

**3. `supabase/functions/kudos-notify-managers/index.ts`** — aceitar payload agrupado:
- Novo contrato: aceita `{ kudo_id }` OU `{ kudo_ids: string[] }` (validação Zod-like leve).
- Carrega todos os kudos em uma query (`.in("id", ids)`), agrupa por `(from_person_id, category, message)` — normalmente será um único grupo.
- Monta a lista de destinatários do kudo (`to_person_id` de cada linha), busca nomes em uma query.
- Recalcula o conjunto de notificados: união dos `gestor_id` dos destinatários + todos os diretores ativos, excluindo remetente e destinatários.
- Idempotência: chave de audit passa de `${kudo_id}:${recipient}` para `${sorted(kudo_ids).join(",")}:${recipient}`, `entidade_id` truncada se necessário (usar hash curto se >255 chars). Mantém `acao='KUDOS_NOTIFY'`.
- Formato da mensagem:
  - 1 destinatário: mantém o texto atual `"{categoria}\n*{from}* deu kudos para *{to}*\n> {msg}"`.
  - N destinatários: `"{categoria}\n*{from}* deu kudos para *{A}*, *{B}* e *{C}*\n> {msg}"` (usar `Intl`-style join manual em pt-BR).
- Email idem: assunto vira `"🎉 {from} deu kudos para {N} pessoas"` e o corpo lista os nomes em `<ul>`.
- Retrocompatibilidade: se vier `{ kudo_id }` único, o fluxo é idêntico ao atual.

### Fora de escopo

- Alterar preferências de opt-in/opt-out de diretores (usuário escolheu manter público).
- Mexer no DM enviado ao próprio destinatário do kudo (fluxo `slack-interactions` slack-only) — esse já é 1 por destinatário e é esperado.
- Backfill dos audit_logs antigos.

## Verificação

Após deploy, testar via `/biscoito` (Slack) enviando um kudo delivery para 3 pessoas cujos gestores/diretores sejam os mesmos: cada notificado deve receber **1** DM listando os 3 nomes, não 3 DMs.
