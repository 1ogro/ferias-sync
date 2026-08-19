# Duplicidade de férias da Bruna Duarte

## Diagnóstico confirmado

A Bruna tem dois pedidos de FÉRIAS idênticos (17/08–31/08), ambos em `APROVADO_FINAL`:

- Criado em 11/06 pela própria Bruna, aprovado em 16/06 (fluxo normal, notificado no Slack).
- Criado em 12/08 por você (`pessoa_016`) com ação `HISTORICAL_CREATE` — cadastro retroativo pelo formulário de "solicitações históricas", com a observação "Solicitação realizada diretamente no portal RH e não registrada aqui".

Ou seja: não é bug de duplo envio. O formulário de cadastro histórico (`HistoricalRequestForm`) insere direto na tabela `requests` **sem** passar pela verificação de sobreposição criada na etapa anterior — que hoje só existe em nova solicitação e edição.

Uma varredura em toda a base encontrou apenas esse par sobreposto ativo.

## Correções

### 1. Dado

Cancelar o registro histórico duplicado de 12/08 (`CANCELADO`), preservando o pedido original de 11/06, com registro em `approvals` e `audit_logs` apontando a substituição.

### 2. Produto — fechar a última porta de entrada

- Aplicar a mesma checagem de sobreposição no formulário de solicitação histórica: antes de inserir, buscar pedidos do colaborador selecionado que cruzem o período (incluindo `REALIZADO`, que hoje fica de fora da lista de status bloqueantes).
- Se houver conflito, abrir o mesmo diálogo de sobreposição já existente, com as opções: cancelar o envio ou substituir o pedido anterior.
- Incluir `REALIZADO` na lista de status considerados na checagem, para não recadastrar retroativamente algo já concluído.

## Detalhes técnicos

- Dados: `UPDATE requests SET status='CANCELADO'` em `cc159a16-9ee2-4540-91c1-6557ccc7965c` + linhas em `approvals` e `audit_logs`.
- `src/lib/requestOverlap.ts`: adicionar `REALIZADO` a `BLOCKING_STATUSES` (ou expor uma lista específica para cadastro retroativo).
- `src/components/HistoricalRequestForm.tsx`: chamar `findOverlappingOwnRequests(formData.requesterId, inicio, fim)` no `handleSubmit`, renderizar `OverlappingRequestsDialog` e usar `supersedeRequests` quando o diretor optar por substituir.
