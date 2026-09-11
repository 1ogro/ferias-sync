# Formulário de biscoito no Slack: fechar na hora e avisar o resultado

Hoje, ao enviar o formulário do `/biscoito`, o Slack fica esperando: a janela não fecha e ninguém recebe aviso de sucesso ou erro. Nos registros da última tentativa (11/09 18:00) só aparece a chegada do envio — nada depois, nem sucesso nem falha. Ou seja, o envio começa a ser processado e não chega a responder ao Slack dentro do tempo que ele exige (3 segundos).

## O que causa isso

Antes de responder ao Slack, o sistema faz uma sequência de consultas: identifica quem enviou, consulta cada colega escolhido no Slack, verifica repetições recentes e grava cada biscoito. Com vários destinatários (ou uma consulta lenta), isso passa dos 3 segundos e o Slack simplesmente fica parado, sem mensagem.

## Como vai ficar

1. Ao clicar em enviar, o Slack faz apenas as conferências rápidas (colega selecionado, tamanho da mensagem, regra de vários destinatários) e **a janela fecha na hora**.
2. O registro do biscoito, os pontos, o post no canal e os avisos continuam acontecendo logo em seguida, em segundo plano.
3. Quem enviou recebe uma mensagem direta curta confirmando: "Biscoito enviado para Fulano 🍪" — ou, se algo falhar, "Não consegui registrar seu biscoito, tente de novo".
4. Se o envio for repetido (mesmo texto para a mesma pessoa em poucos minutos), a janela fecha e a pessoa é avisada de que o biscoito já havia sido registrado.

Nada muda para quem recebe o biscoito: as mensagens diretas e o post no canal continuam iguais.

## Detalhes técnicos

- Em `supabase/functions/slack-interactions/index.ts`, ramo `callback_id === "biscoito_submit"`: manter no caminho síncrono só a leitura do `view.state.values`, as validações de formato e a checagem de papel do remetente quando houver múltiplos destinatários (resolvida por `slack_user_id` em uma única consulta). Tudo o mais — `users.info` por destinatário, `findRecentKudoDuplicate`, inserts em `kudos`, `awardPoints`, `ensurePending`, posts e DMs — vai para a função de segundo plano já existente (`postBiscoitoSideEffects`).
- Responder `{"response_action":"clear"}` imediatamente após as validações rápidas.
- Guard defensivo em torno de `EdgeRuntime.waitUntil` (checar existência antes de chamar) para não derrubar o handler caso a API não esteja disponível.
- Confirmação ao remetente via `conversations.open` + `chat.postMessage` ao final do processamento em segundo plano, com resumo de sucesso, deduplicação ou falha.
- Logs de entrada/saída com marcação de tempo (`[biscoito_submit] ack em Xms`) e log explícito de erro no bloco de segundo plano, para diagnosticar caso volte a travar.
- Aplicar o mesmo ajuste no ramo `kudos_submit:` (modal disparado pelo pulse), que tem o mesmo padrão de trabalho antes do ack.
- Depois das edições: `npx tsgo --noEmit -p tsconfig.json` e redeploy de `slack-interactions`; teste real pelo `/biscoito` conferindo o fechamento imediato e a DM de confirmação.
