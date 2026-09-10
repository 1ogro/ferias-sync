# Trocar "kudos" por "biscoito" em tudo que a pessoa lê

A palavra "kudos" some de todos os textos visíveis: mensagens do Slack, telas do app, relatórios e e-mails. Nada muda no funcionamento — só o vocabulário.

## Vocabulário adotado

- "deu kudos para" → "deu um biscoito para"
- "Dar um kudos" → "Dar um biscoito"
- "Feed de kudos" → "Feed de biscoitos"
- "Kudos recebido / enviado" → "Biscoito recebido / enviado"
- "Kudos trocados" → "Biscoitos trocados"
- "Top kudos recebidos" → "Quem mais recebeu biscoito"
- Plural: biscoitos. Singular: biscoito.

## Onde os textos mudam

Slack:
- Mensagem no canal quando alguém reconhece um colega (um ou vários destinatários)
- Aviso por mensagem direta para quem recebeu
- Aviso para gestores e diretores
- Reenvio de avisos pendentes
- Modal e botão de envio disparados pelo Slack
- Relatório mensal de engajamento

App:
- Tela de Engajamento: botão, título do feed, avisos de sucesso e erro, rótulos de pontos, texto do compartilhamento no canal
- Painéis de feedback por perfil, ciclos, resumo por time e relatório mensal
- Catálogo de notificações (nomes e descrições)
- Tela de administração (resumo de impacto ao excluir pessoa)
- Modelos e formulários de pulse que citam kudos
- Ferramentas de consulta (títulos e descrições apresentadas)

## Detalhes técnicos

- Alteração restrita a strings de interface e mensagens; nomes de tabelas, colunas, RPCs, funções edge (`kudos-send`, `kudos-notify-managers`, `kudos-redeliver-dm`), rotas, chaves de query e identificadores TypeScript permanecem como estão para não quebrar dados nem integrações.
- Textos já gravados no banco (registros históricos de notificações) não são reescritos.
- Após as edições: `tsgo --noEmit` e redeploy das edge functions afetadas (`kudos-send`, `kudos-notify-managers`, `kudos-redeliver-dm`, `pulse-dispatch`, `slack-interactions`, `engagement-monthly-report`, `mcp`).
- Verificação final: busca por "kudo" restrita a identificadores, sem sobras em texto visível.
