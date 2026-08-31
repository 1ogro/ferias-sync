# Inativar por padrão, excluir de vez apenas para admin

## O problema (confirmado no banco)

A exclusão falha porque várias tabelas apontam para `people` sem regra de exclusão. Chaves estrangeiras atuais:

| Tabela | Coluna | Regra hoje | Efeito |
|---|---|---|---|
| pulse_responses | respondent_id | nenhuma | bloqueia (erro do print) |
| pulse_surveys | created_by | nenhuma | bloqueia |
| medical_leaves | person_id, created_by | RESTRICT | bloqueia |
| special_approvals | manager_id | RESTRICT | bloqueia |
| payment_day_change_requests | reviewed_by | nenhuma | bloqueia |

As demais (solicitações, kudos, pontos, perfis, pares de peer review, preferências) já apagam ou desvinculam automaticamente.

## O que será feito

### 1. Inativação como ação padrão
- O botão de remover na Administração passa a **inativar** o colaborador (`ativo = false`), preservando todo o histórico.
- Antes de inativar, a reatribuição de time/solicitações pendentes continua como hoje (mesmo fluxo do diálogo de reatribuição).
- Registro em auditoria da inativação, com quem executou.
- A pessoa some das listas operacionais e pode ser reativada pela edição.

### 2. Exclusão definitiva só para admin
- Opção separada "Excluir definitivamente", visível apenas para admin, com confirmação e justificativa obrigatória.
- Antes de confirmar, mostra o que será apagado junto: respostas de pulse, pesquisas criadas, licenças médicas, aprovações especiais, solicitações, kudos e pontos.
- Migração ajusta as chaves bloqueantes:
  - apagam junto: `pulse_responses.respondent_id`, `pulse_surveys.created_by`, `medical_leaves.person_id`, `special_approvals.manager_id`
  - apenas perdem a referência: `medical_leaves.created_by`, `payment_day_change_requests.reviewed_by`
- Erro técnico de vínculo (23503) traduzido em mensagem amigável.

## Detalhes técnicos

- Migração única: `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ... ON DELETE CASCADE|SET NULL`.
- Nova função `deactivate_person(p_person_id, p_justification)` (SECURITY DEFINER) para inativar + auditar; exclusão definitiva usa `reassign_and_delete_person` / delete direto, restrito por `is_current_user_admin()`.
- `get_manager_deletion_impact` retorna também as novas contagens (pulse, licenças, aprovações especiais).
- Frontend: `src/pages/Admin.tsx` (`handleDelete`) e `src/components/DeletionDialog.tsx` ganham os dois modos (inativar / excluir definitivamente).
- Sem alterações em grants; políticas de RLS mantidas.
