# Corrigir falsos "sem vínculo com Slack" no relatório de perfis incompletos

## O que está acontecendo hoje

O relatório NÃO faz nenhuma busca no Slack para decidir se a pessoa tem vínculo. Ele apenas olha a coluna `slack_user_id` da tabela `people`: se estiver vazia, o alerta "vincular usuário do Slack" é disparado.

Essa coluna só é preenchida quando a pessoa interage com o bot (kudos, /biscoito, pulses) — não pelo e-mail pessoal cadastrado no perfil. Por isso o Bruno Salomon (`pessoa_004`, e-mail pessoal `br.salomon@gmail.com`, `slack_user_id` vazio) aparece no relatório mesmo tendo o e-mail pessoal preenchido.

Situação atual do banco: 34 pessoas ativas, 20 sem `slack_user_id`, das quais 14 já têm e-mail pessoal cadastrado.

## O que será feito

Antes de acusar "sem Slack", o job vai tentar resolver o vínculo de verdade:

1. Para cada pessoa ativa sem `slack_user_id`, consultar o Slack por e-mail — primeiro o corporativo, depois o pessoal (`email_pessoal`).
2. Se encontrar, gravar o ID na pessoa (backfill), registrar em `audit_logs` como `SLACK_ID_BACKFILL` (mesmo padrão já usado hoje, aparecendo em /admin/mescladas) e **não** listar essa pendência no relatório.
3. Só manter o alerta quando nenhum dos dois e-mails resolver no Slack. Nesse caso a mensagem passa a ser mais clara sobre a causa:
   - sem e-mail pessoal cadastrado: "cadastre o e-mail pessoal usado no Slack";
   - com e-mail pessoal, mas não encontrado no Slack: "o e-mail pessoal cadastrado não corresponde a nenhuma conta do Slack — procure o administrador".

O relatório passa a reportar também quantos vínculos foram resolvidos automaticamente na execução.

## Detalhes técnicos

- `supabase/functions/send-registration-reminders/lib.ts`: `peopleIncompleteReasons` deixa de usar apenas `slack_user_id`; recebe um estado de vínculo já resolvido (`linked` | `no_personal_email` | `not_found`) e produz a mensagem correspondente. Mantém-se pura e testável.
- `supabase/functions/send-registration-reminders/index.ts`: nova etapa de resolução, reutilizando `slackLookupByEmail` para corporativo e pessoal, com update em `people.slack_user_id` + insert em `audit_logs`. Lookups apenas para quem está sem ID (hoje, 20 pessoas), respeitando o rate limit do Slack com execução sequencial.
- `supabase/functions/send-registration-reminders/lib_test.ts`: casos novos para os três estados de vínculo.
- Validação: rodar os testes Deno e uma execução `dry_run` para conferir a lista final antes de qualquer envio real.
