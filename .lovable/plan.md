## Diagnóstico

Os emails em `people` são aliases corporativos no formato `<usuario>.<projeto>@rededor.com.br` (ex.: `rneto.rqon@rededor.com.br`, `amizarela.pj@rededor.com.br`). É praticamente certo que os emails das contas no Slack são diferentes (email pessoal ou outro formato corporativo), então o match por email falha para a maioria — por isso quase todo mundo aparece como `[slack only]`, mesmo já cadastrado.

## Correção em `supabase/functions/slack-slash-biscoito/index.ts`

Adicionar **fallback por nome normalizado** depois do match por email.

1. **Helper `normName`**: lowercase + trim + remover acentos (`normalize("NFD").replace(/\p{Diacritic}/gu, "")`) + colapsar espaços.
2. **Indexar `people` por nome normalizado** (além do email):
   - `nameToPerson: Map<string, Person>` usando `normName(p.nome)`.
   - Em colisão de nomes idênticos, manter o primeiro e logar `console.warn` (workspace tem ~35 pessoas; baixa probabilidade).
3. **Para cada Slack member**, depois de tentar email, tentar nome:
   - Coletar candidatos: `profile.display_name`, `profile.real_name`, `real_name`, `name` — normalizar cada um.
   - Para cada candidato não vazio, se `nameToPerson` tem match → usar como pessoa do app.
   - Se nenhum bater → `[slack only]`.
4. **Dedup** continua: `seenPersonIds` evita listar a mesma pessoa duas vezes quando email e nome batem em contas Slack diferentes.
5. **Sender**: além de email, também remover Slack members cujo nome normalizado bata com o nome do sender (caso o sender também não tenha email casando).
6. **Log de diagnóstico**: contar quantos casaram por email vs por nome vs ficaram slack-only, para validar.

## Validação

- Abrir `/biscoito`: praticamente todos os 32 cadastrados aparecem **sem** `[slack only]`.
- `[slack only]` só aparece para Slack members que não casam por email nem por nome com ninguém em `people`.
- Sender não aparece na lista.
- Logs da função mostram a distribuição (email/nome/slack-only).

## Fora de escopo

- Alterar `slack-interactions` (valores `app:<id>` / `slack:<id>` continuam iguais).
- Schema, frontend, RPCs.
- Fuzzy matching mais agressivo (sobrenome parcial, apelidos) — só adicionamos se os logs mostrarem que ainda sobra gente cadastrada como slack-only.
