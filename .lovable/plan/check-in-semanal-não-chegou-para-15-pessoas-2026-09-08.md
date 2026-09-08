# Check-in semanal não chegou para 15 pessoas

## O que aconteceu

No envio de 07/09 o check-in semanal foi endereçado a 33 pessoas ativas, mas só 18 receberam. O registro do envio mostra o motivo para Pedro Belsito e para outras 14 pessoas: `lookup_failed / users_not_found`.

A rotina de envio do check-in procura a pessoa no Slack **apenas pelo e-mail corporativo**. Quando esse e-mail não é o cadastrado no Slack, o Slack responde "usuário não encontrado" e a pessoa é simplesmente pulada — mesmo quando o sistema já tem o ID do Slack dela guardado (é o caso do Pedro, que tem ID salvo e mesmo assim foi pulado).

Pessoas afetadas no último envio: Pedro Belsito, Airton Jordani, André Mizarela, Antenor Jr, Ariel Cardeal, Bruno Salomon Ribeiro, Gilberto, Karoline de Macedo Santos, Katja de Aquino Gazzola, Marcela Etiane da Silva Souza, Melissa Cardoso, Paula Albuquerque, Rachel Lima, Steffani Nascimento, Vanessa Adão. O mesmo vale para o Check-out semanal e o Kudos da semana, que usam a mesma rotina.

## Correção

1. Passar a identificar a pessoa no Slack na seguinte ordem, igual ao que já é feito nos biscoitos:
   - ID do Slack já salvo no cadastro;
   - e-mail corporativo;
   - e-mail pessoal;
   - busca pelo nome na lista de membros do Slack.
   Quando o ID for descoberto, salvá-lo no cadastro para os próximos envios.
2. Manter o registro de diagnóstico de cada envio, agora indicando qual caminho resolveu (ou por que nenhum resolveu), para acompanhar quem continua sem alcance.
3. Reenviar o check-in desta semana para as pessoas que ficaram de fora, sem duplicar para quem já recebeu.
4. Conferir o resultado do reenvio no registro de envios e reportar quem, se alguém, continua sem cadastro localizável no Slack (por exemplo, quem não tem conta no espaço de trabalho).

## Detalhes técnicos

- Extrair um `resolveSlackId(admin, person)` para `supabase/functions/_shared/notify-helpers.ts`, baseado no que já existe em `kudos-notify-managers/index.ts`, com fallback por `slack_user_id` → `email` → `email_pessoal` → `users.list` por nome, persistindo em `people.slack_user_id`.
- Usar esse helper em `supabase/functions/pulse-dispatch/index.ts` no lugar de `lookupSlackUserByEmail`, também selecionando `email_pessoal` e `slack_user_id` na consulta de destinatários e permitindo pessoas sem e-mail corporativo desde que tenham ID salvo.
- Reenvio pontual: chamar `pulse-dispatch` em modo de reenvio para o `run_id` e2e618c2c4 (check-in de 07/09), enviando apenas para `person_id` sem linha em `pulse_run_recipients` daquele run; inserir as linhas correspondentes ao concluir.
- `pulse-reminders` usa `slack_channel` já gravado e não precisa de mudança.
