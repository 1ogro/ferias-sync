# Recuperar o gráfico dos times sem perder o anonimato

## Diagnóstico confirmado

- “Protegida” significa que a média foi ocultada para preservar o anonimato; não significa ausência de respostas.
- A regra atual é excessivamente abrangente: se um time tem uma semana ou um tipo de resposta com apenas 1–2 participantes, todas as suas médias são ocultadas, inclusive o resumo do período.
- Na consulta das últimas 12 semanas, os sete times com notas entram nessa proteção integral. Por exemplo, **Pacientes tem seis participantes distintos no período e cinco semanas com pelo menos três participantes**, considerando check-in e check-out juntos, mas toda a série fica oculta. Esses números não garantem publicação de cada ponto: ainda é necessário verificar proteção por combinação de resultados.
- O gráfico recebe essas médias como valores vazios e não desenha os pontos. As políticas de acesso foram consultadas; a regra explícita do relatório explica o bloqueio, sem necessidade de abrir acesso às respostas individuais.

## O que será ajustado

1. **Proteger o resultado necessário, não o time inteiro.** Avaliar cada semana, tipo e resumo do período separadamente, mantendo o mínimo de três pessoas distintas — três respostas da mesma pessoa não bastam.
2. **Recuperar os pontos que puderem ser exibidos com segurança.** Uma semana com baixa participação não deverá, por si só, apagar todas as outras. Times com participação insuficiente continuarão protegidos.
3. **Explicar os vazios no próprio gráfico.** Diferenciar “Sem respostas”, “Participação insuficiente” e “Proteção de anonimato por combinação de resultados”. Quando não houver nenhum ponto publicável, mostrar o motivo em vez de apenas um gráfico vazio; quando houver apenas a linha geral, informar que as médias dos times estão protegidas.
4. **Manter gráfico, cartões, tabela e CSV consistentes.** Não substituir médias protegidas por zero, não ligar linhas através dos intervalos protegidos e não alterar as notas ou contagens para produzir um gráfico artificial.

## Detalhes técnicos

- Ajustar `get_wellbeing_report` para identificar resultados protegidos pela combinação de nível, semana, escopo, time e tipo, em vez de manter uma lista global de times bloqueados.
- Aplicar proteção complementar somente onde necessária para impedir dedução por diferença entre geral e times, check-in/check-out e combinado, semanas e total do período. Considerar também a comparação entre janelas de 4, 8, 12 e 26 semanas e chamadas com períodos sobrepostos.
- Calcular a proteção antes do filtro de time, com decisões determinísticas. Trocar filtros ou exportar o CSV não poderá revelar uma média protegida. Se a publicação segura de um resultado não for demonstrada nos testes, mantê-lo protegido.
- Retornar um motivo de proteção sem dados individuais e utilizá-lo em `useWellbeing.ts` e `WellbeingTeamPanel.tsx`.
- Preservar autenticação, permissões e RLS; não criar exceção de anonimato para administradores nem ampliar acesso a pessoas ou respostas. Não alterar pesquisas, respostas históricas ou notificações.

## Validação antes de produção

- Testar a nova regra em ambiente isolado antes de aplicar qualquer alteração ao banco conectado.
- Cobrir times com semanas pequenas e grandes, pessoas repetidas, ausência de respostas, tipos diferentes e proteção complementar entre todas as dimensões. Validar tentativas de reconstrução por filtros e períodos sobrepostos, não apenas o limite de três participantes.
- Reconciliar contagens e médias publicáveis com os registros originais; confirmar que resultados continuam idênticos entre “Todos os times” e o time selecionado.
- Conferir visualmente pontos recuperados, lacunas, mensagens de proteção, filtros e CSV. A validação autenticada completa depende de acesso de teste disponível no Supabase externo, sem solicitar credenciais pessoais.

**Resultado esperado:** visualizar a evolução dos times onde houver anonimato suficiente e entender claramente os casos que precisam continuar protegidos.