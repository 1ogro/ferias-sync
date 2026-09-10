# Corrigir médias e histórico de Bem-estar

## Diagnóstico confirmado

- Pelo vínculo com o disparo, usado pelo relatório dos pulses, existem **49 notas de check-out em 11 semanas**, média **3,71**, e **89 notas de check-in**, média **3,89**. São valores da consulta realizada nesta investigação, sujeitos a novas respostas.
- As **5 respostas** correspondem à última semana com check-out, iniciada em **31/08**, não ao histórico completo. O painel usa somente a última semana disponível para os cartões e a tabela, apesar do filtro de várias semanas.
- As médias gerais do painel são reconstruídas apenas com times que têm pelo menos três respondentes na semana. Isso descarta notas válidas do total: na semana de 07/09, por exemplo, o check-in tem 15 notas com média 3,73, mas o painel calcula 4,00 usando apenas 10 delas.
- A separação de check-in/check-out no Bem-estar usa o dia da resposta, enquanto o relatório dos pulses usa a pesquisa do disparo. Na base consultada essas classificações coincidem; portanto, essa diferença não explica sozinha o problema atual.
- Há **12 respostas com pergunta de uma pesquisa e disparo de outra**. O recebimento pelo Slack consulta um campo `kind` inexistente nas perguntas e permite retornar um disparo novo com a pergunta antiga quando o mapeamento falha. Isso também afeta médias por pergunta no relatório.

## Resultado esperado

1. **Cartões e totais pelo período selecionado**, conforme sua escolha: todas as 4, 8, 12 ou 26 semanas escolhidas, respeitando time e tipo. Exibir as datas do intervalo e separar os totais de notas de check-in e check-out.
2. **Médias gerais calculadas diretamente sobre as notas elegíveis**, sem média de médias arredondadas e sem descartar times pequenos do agregado geral. Manter a proteção de anonimato nas visões por time e não expor notas individuais.
3. **Tabela por time resumindo o mesmo período** e gráfico mantendo a evolução semanal. Semanas sem notas ou com média protegida devem ser distinguíveis; não ligar linhas através de semanas sem média. Os totais continuam visíveis mesmo quando a média estiver protegida.
4. **CSV coerente com os filtros**, contendo o resumo do intervalo e o detalhamento semanal, com identificação clara de cada nível de agregação.
5. Manter o histórico geral do relatório dos pulses; não voltar a limitar seus números gerais às últimas 12 semanas.

## Detalhes técnicos

### Agregação e interface

- Ajustar `get_wellbeing_team_weekly` e acrescentar agregação de resumo no servidor para o período, geral e por time. Usar a pesquisa do disparo como identidade, com classificação explícita das duas pesquisas de bem-estar, não o dia da resposta nem todas as pesquisas `self` indiscriminadamente.
- Usar semanas de segunda a domingo em `America/Sao_Paulo`, alinhando também a evolução semanal dos pulses. Manter a data de envio da resposta como referência temporal da nota.
- Calcular a média sobre valores originais e arredondar apenas o resultado final. Contar notas separadamente de depoimentos; pessoas distintas devem ser contadas no servidor, sem somar contagens semanais ou usar `Math.max` entre tipos.
- Para participação, usar pares pessoa/disparo efetivamente enviados e respondidos no mesmo conjunto de disparos, deixando esse denominador identificado. Respostas históricas em disparos de reclassificação sem destinatários continuam nas médias, mas não criam destinatários fictícios.
- Aplicar limiar de anonimato ao agregado solicitado. Validar também risco de dedução por diferença entre total geral e times publicados; quando necessário, proteger médias adicionais, nunca retirar silenciosamente notas do cálculo.
- Preservar permissões existentes: comparação entre relatórios deve usar o mesmo escopo autorizado. Não liberar respostas individuais de gestores/diretores para igualar números; identificar visões parciais quando aplicável.
- Atualizar `useWellbeing.ts` e `WellbeingTeamPanel.tsx`; manter a lista de times estável ao selecionar um time. Remover a comparação semanal dos cartões de período para não misturar intervalos.

### Integridade das respostas

- Em `slack-interactions`, remover o uso de `pulse_questions.kind` e só reclassificar quando disparo e pergunta de destino forem ambos válidos. Em falha, conservar o par original consistente e registrar o erro. Não alterar a regra existente de reclassificação temporal neste ajuste.
- Corrigir os 12 vínculos por migração auditada, preservando disparo, pessoa, nota, texto e data; mapear a pergunta por pesquisa de destino, posição e tipo. A consulta encontrou exatamente uma pergunta correspondente e nenhum conflito para cada caso.
- Revalidar essas condições imediatamente antes da atualização e interromper se houver ambiguidade ou conflito. Acrescentar validação de integridade para impedir novos pares pergunta/disparo de pesquisas diferentes.
- Mudanças de banco somente por migração, com autorização das funções preservada, `search_path` fixo e concessões explícitas de execução; sem ampliar RLS de pessoas ou respostas.

## Validação e segurança de produção

- Testar primeiro em ambiente de teste/Remix, antes de aplicar alterações de dados ou funções em produção.
- Reconciliar as médias e contagens por tipo, semana, time e período com consultas diretas e com o relatório dos pulses no mesmo escopo. No retrato atual de 12 semanas: check-out 49 notas / 3,71; check-in 89 / 3,89.
- Cobrir menos de três respondentes, respostas tardias, virada de semana no fuso local, semanas vazias, ambos os tipos, filtros e CSV.
- Testar falha no mapeamento de pergunta no Slack e confirmar ausência de novos vínculos inconsistentes, sem reenviar pesquisas ou notificações reais.
- Conferir cartões, tabela e gráfico na prévia. Como o Supabase é externo, a verificação autenticada completa depende de acesso de teste disponível, sem solicitar credenciais pessoais.