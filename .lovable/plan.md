# Corrigir a tela de detalhe/edição da solicitação para colaboradores

## Problema confirmado

Na tela de detalhe da solicitação (`/requests/:id`), o bloco "Ações de Aprovação" com o campo de comentário e os botões **Aprovar / Reprovar / Pedir Informações** aparece para qualquer usuário logado sempre que o status é "em análise" — inclusive para o próprio solicitante. Isso dá a impressão de que o colaborador aprova as próprias férias.

Além disso, esses três botões na tela de detalhe não têm nenhuma ação ligada: clicar neles não faz nada (a aprovação real só funciona na Caixa de Entrada).

## O que será feito

1. **Esconder as ações de aprovação de quem não é aprovador.** O bloco só aparece para o gestor do solicitante, diretores e admins — e nunca para o próprio solicitante, mesmo que ele seja gestor de outras pessoas.

2. **Ligar os botões de verdade.** Para quem é aprovador, Aprovar / Reprovar / Pedir Informações passam a executar a mesma lógica já usada na Caixa de Entrada (atualizar status, registrar o comentário no histórico, notificar), com estado de carregamento e recarga da linha do tempo.

3. **Nova visão para o colaborador (dono da solicitação).** No lugar do bloco de aprovação, um card "Acompanhamento" com:
   - Texto de status claro: "Aguardando aprovação do seu gestor" / "Aguardando aprovação da diretoria".
   - Campo "Adicionar comentário" com rótulo explicativo ("Envie uma observação ao aprovador — isso não altera o status da solicitação") e botão **Enviar comentário**.
   - O comentário é gravado no histórico e passa a aparecer na linha do tempo lateral.

4. **Rótulos mais claros na tela de edição** (`/requests/:id/edit`): título e botão distinguindo edição do próprio rascunho e edição administrativa, sem qualquer texto de aprovação.

## Detalhes técnicos

- `src/pages/RequestDetail.tsx`: condicionar o card de aprovação a `isApprover = (isManager || isDirectorOrAdmin) && !isOwnRequest`; extrair a lógica de aprovação do `Inbox.tsx` para uso compartilhado; novo card de acompanhamento para `isOwnRequest`.
- Comentário do solicitante gravado em `approvals` com `acao = 'COMENTARIO'` e `level = 'SOLICITANTE'`; `fetchTimelineEvents` e `RequestTimeline` passam a renderizar esse tipo como evento neutro (sem badge de aprovado/reprovado).
- Nenhuma mudança de schema; se a coluna `acao` tiver constraint que rejeite `COMENTARIO`, será adicionada uma migração ampliando os valores permitidos.
