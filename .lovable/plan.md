# Respostas de pulse agrupadas por pessoa

Hoje, no relatório de um pulse (check-in / check-out), cada resposta aparece em uma linha separada: uma linha para a nota (sentimento) e outra para o depoimento em texto, mesmo quando foram enviadas pela mesma pessoa no mesmo envio. Isso duplica visualmente as pessoas e dificulta a leitura.

## O que muda

- Na lista "Respostas recentes", cada pessoa passa a aparecer **uma vez por envio**, com as colunas:
  - Data (a mais antiga das respostas daquele envio; horários diferentes entre nota e texto são ignorados)
  - Respondente (nome, ou rótulo anônimo quando a pesquisa é anônima)
  - Nota (ex.: 4/5)
  - Depoimento (texto)
- Se a pesquisa tiver mais de uma pergunta de nota ou de texto, os valores aparecem juntos na mesma célula, identificados pela pergunta.
- O filtro "Somente com comentário" passa a manter as linhas cujo envio tenha algum depoimento (mantendo a nota junto).
- O filtro de pergunta continua funcionando: ao escolher uma pergunta específica, só as respostas dela entram na linha.
- A exportação "CSV filtrado" segue o mesmo formato agrupado (Data, Respondente, Nota, Depoimento).
- As exportações completas (CSV e Excel) também passam a sair agrupadas: uma linha por pessoa por envio, com colunas de nota e de depoimento.

## Detalhes técnicos

- `src/components/pulses/PulseResultsPanel.tsx`: novo memo que agrupa as respostas filtradas por `run_id` + identificador do respondente (`respondent_id` ou `anonymous_label`), consolidando `scale_value` e `text_value`; a tabela e `handleExportFiltered` passam a consumir esse agrupamento. Nenhuma alteração nos cálculos de médias, taxa de resposta ou gráfico de evolução.
- `supabase/functions/pulse-export/index.ts`: montagem das linhas passa a agrupar por `run_id` + `respondent_id`, com cabeçalho `Data | Respondente | Nota | Depoimento` (colunas extras por pergunta quando houver mais de uma pergunta de cada tipo). Mesma lógica para CSV e XLSX.
- Sem mudanças de banco de dados.
