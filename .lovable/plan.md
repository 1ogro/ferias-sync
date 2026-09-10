# Impedir contagem duplicada nos pulses

## Diagnóstico confirmado

- Douglas respondeu ao check-in da semana de 07/09 duas vezes em 09/09, com menos de um segundo de diferença. As duas notas ficaram em disparos diferentes: o regular e um registro auxiliar de reclassificação.
- A proteção atual impede respostas duplicadas dentro do mesmo disparo, mas não entre esses dois registros da mesma semana.
- A consulta ao histórico encontrou **10 duplicidades em 7 pessoas**, todas envolvendo registros reclassificados. Em um caso, os valores divergem.
- O recebimento de respostas pode criar um registro auxiliar sem reutilizar o disparo regular daquela pesquisa e semana.

## Comportamento escolhido

**A última resposta substitui a anterior, sem aumentar a contagem.**

- Nos check-ins e check-outs semanais de bem-estar, cada pessoa terá uma resposta válida por pergunta, pesquisa e semana.
- Nota e depoimento continuam sendo perguntas independentes: editar a nota não apaga o comentário, nem impede responder ao comentário depois.
- Check-in e check-out continuam separados. Respostas de semanas diferentes permanecem válidas.
- Ao alterar uma resposta, o Slack confirma “Resposta atualizada”, em vez de tratar a alteração como uma nova participação.
- Repetir exatamente o mesmo envio não gera novos pontos nem notificações duplicadas.

## Correção

### 1. Unificar o registro da mesma semana

Usar uma referência única para cada pesquisa semanal de bem-estar, compartilhada pelo envio regular, reenvios e respostas reclassificadas. Uma resposta que pertença à mesma pesquisa e semana deve atualizar o registro existente, independentemente da mensagem do Slack usada.

Preservar a regra atual de classificação entre check-in e check-out; corrigir a duplicação que ela pode produzir, sem redefinir silenciosamente qual pesquisa recebe uma resposta.

### 2. Corrigir o histórico afetado

- Apresentar e validar a prévia dos registros afetados em ambiente isolado antes de aplicar qualquer correção em produção.
- Consolidar as duplicidades confirmadas, mantendo a última resposta por pergunta, pela data registrada; desempatar de forma determinística.
- Preservar respostas exclusivas dos registros auxiliares, comentários, semanas diferentes e avaliações de pares.
- Registrar em auditoria os registros anteriores e a decisão de consolidação, permitindo rastrear e reverter a correção.
- Reconciliar contadores, participação e eventuais pontos concedidos em duplicidade entre os disparos consolidados. Não reenviar notificações históricas.

### 3. Manter os resultados consistentes

Relatórios de pulses, Bem-estar, gráficos e exportações devem consumir a mesma resposta válida. A atualização muda a nota ou o depoimento, mas não acrescenta uma participação nem uma segunda linha para aquela pessoa no mesmo ciclo.

Manter as regras de anonimato e acesso existentes; não liberar respostas individuais nem reduzir o limite de proteção das médias.

## Detalhes técnicos

- Centralizar a resolução do ciclo e a gravação em operação transacional, com unicidade e proteção contra concorrência no banco. Não depender apenas de consultar antes de inserir ou de esconder duplicatas na tela.
- Ajustar `resolve-pulse.ts`, os dois caminhos de resposta em `slack-interactions/index.ts` e a criação/reutilização de disparos em `pulse-dispatch/index.ts` para compartilhar a referência canônica da pesquisa/semana. Restringir essa regra aos pulses semanais de bem-estar, sem juntar pesquisas avulsas ou pares legítimos.
- Calcular o ciclo em `America/Sao_Paulo`. A resposta deve continuar vinculada ao ciclo resolvido, sem usar a data de edição para deslocar uma resposta regular para outra semana.
- Manter a chave por pergunta e respondente; preservar `subject_id` nas avaliações de pares.
- Identificar repetição técnica pelo evento do Slack e considerar a ordem original dos eventos, evitando que uma tentativa antiga sobrescreva uma resposta mais recente. Distinguir inserção, atualização e repetição para controlar contadores, pontos e notificações.
- Preservar a data inicial de participação e registrar a data da atualização. Retornar erros de gravação ao usuário, sem confirmar sucesso quando a resposta não foi salva.
- Conferir referências de respostas, destinatários e pontos antes de consolidar registros auxiliares; não apagar disparos com dados exclusivos.
- Aplicar mudanças estruturais por migração, com permissões explícitas e sem ampliar RLS. Fazer a correção dos dados de forma auditada e transacional após os testes.

## Validação

- Reproduzir o caso do Douglas: resposta pelo disparo regular e por mensagem reclassificada na mesma semana; resultado esperado: uma nota válida, com o último valor.
- Testar cliques simultâneos, tentativas repetidas do Slack e processamento fora de ordem.
- Testar alteração de nota, edição de comentário e preenchimento de comentário depois da nota.
- Testar criação simultânea de disparos regulares e auxiliares, garantindo reutilização do mesmo ciclo.
- Confirmar que check-in, check-out, semanas diferentes e avaliações de pessoas diferentes não são consolidados indevidamente.
- Comparar totais, médias, participação e exportações antes/depois; executar os testes de anonimato do Bem-estar.
- Validar primeiro em ambiente isolado e conferir a interface com dados controlados. A verificação autenticada real depende do acesso disponível no Supabase externo, sem solicitar credenciais pessoais.

## Fora do escopo

Mudanças no desenho das pesquisas, regras de pontuação, permissões de gestores ou problemas não relacionados à duplicidade.