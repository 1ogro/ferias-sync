# Reatribuição de equipe ao excluir um gestor

Hoje a exclusão é direta (`supabase.from('people').delete()` em `Admin.tsx`). Vamos introduzir um fluxo obrigatório de reatribuição quando o alvo possuir subordinados ativos, solicitações em aberto ou cadastros pendentes vinculados.

## Fluxo de UX

1. Admin clica em "Excluir" em uma pessoa com papel GESTOR (ou em qualquer pessoa que tenha pendências como gestor).
2. Antes de abrir o diálogo atual de confirmação, o sistema busca as dependências do alvo:
   - `people` ativos com `gestor_id = alvo` (subordinados ativos)
   - `requests` com `status` em (`PENDENTE`, `INFORMACOES_ADICIONAIS`) cujo `requester_id` é subordinado ativo do alvo (aprovações em aberto)
   - `pending_people` com `status = 'PENDENTE'` e `gestor_id = alvo` ou `created_by = alvo`
3. Se houver qualquer pendência: abre um novo diálogo `ReassignManagerDialog` com:
   - Resumo das pendências (X subordinados, Y solicitações pendentes, Z cadastros pendentes), com listas colapsáveis.
   - Combobox "Novo gestor" listando pessoas ativas com papel `GESTOR` ou `DIRETOR`, excluindo o próprio alvo.
   - Botão "Reatribuir e excluir" (desabilitado até escolher substituto) e "Cancelar".
4. Se não houver pendências: segue direto para o `DeletionDialog` atual.

## Operação no backend

Tudo executado em uma RPC `reassign_and_delete_person(p_person_id text, p_new_manager_id text, p_justification text)` com `SECURITY DEFINER` (admin/diretor apenas, validado por `is_current_user_admin()` ou papel). Em transação:

- Valida que o novo gestor está ativo e tem papel `GESTOR` ou `DIRETOR`.
- `UPDATE people SET gestor_id = p_new_manager_id WHERE gestor_id = p_person_id AND ativo = true`.
- `UPDATE pending_people SET gestor_id = p_new_manager_id WHERE gestor_id = p_person_id AND status = 'PENDENTE'`.
- Para cada `request` aberta (PENDENTE/INFORMACOES_ADICIONAIS) dos subordinados que agora pertencem ao novo gestor: nada precisa ser atualizado na tabela `requests` em si (a aprovação é determinada pelo `gestor_id` atual do colaborador via RLS/lógica), mas registramos em `audit_logs` o redirecionamento (uma linha por request afetada) para rastreabilidade.
- `INSERT audit_logs` com ação `REASSIGN_MANAGER` contendo `{old_manager_id, new_manager_id, justification, counts:{subordinates, pending_requests, pending_people}}`.
- `DELETE FROM people WHERE id = p_person_id`.
- `INSERT audit_logs` com ação `DELETE_WITH_REASSIGN` (complementa o trigger de auditoria de `people`).

A RPC retorna `{success, counts}` para o frontend exibir confirmação detalhada.

## Notificação Slack

Após sucesso, mantemos `sendAdminNotification({change_type: 'deletion', ...})` e adicionamos uma linha extra (fire-and-forget) com o resumo da reatribuição: "🔄 Equipe de *X* (N pessoas) reatribuída para *Y* por *Admin*."

## Arquivos a alterar/criar

- **Migration**: criar RPC `reassign_and_delete_person` (+ função auxiliar `get_manager_deletion_impact(p_person_id)` que retorna os contadores e listas para a UI).
- **`src/components/ReassignManagerDialog.tsx`** (novo): diálogo com resumo + select de substituto.
- **`src/pages/Admin.tsx`**:
  - Em `handleDelete`, antes da exclusão, chamar `get_manager_deletion_impact`.
  - Se contadores > 0, abrir `ReassignManagerDialog` em vez do `DeletionDialog`.
  - No confirm, chamar `reassign_and_delete_person`.
- **`src/components/DeletionDialog.tsx`**: sem alterações.

## Permissões / Segurança

- RPC restrita a admins/diretores (verificação dentro da função via `is_current_user_admin()` + checagem de papel).
- Nenhuma alteração de RLS necessária (todas as tabelas já permitem update por admin).
- Auditoria garante rastreabilidade da reatribuição.

## Fora de escopo

- Reatribuir aprovações já registradas em `approvals` (registros históricos imutáveis).
- Reatribuir solicitações já `APROVADO_FINAL` ou `REALIZADO`.
- Fluxo de reatribuição em massa de múltiplos gestores.
- Notificar os subordinados sobre a mudança de gestor (pode ser adicionado depois).
