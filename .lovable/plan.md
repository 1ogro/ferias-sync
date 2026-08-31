# Corrigir exclusão de pessoas bloqueada por vínculos

## O problema (confirmado no banco)

A exclusão falha porque várias tabelas apontam para `people` sem regra de exclusão em cascata. Verifiquei as chaves estrangeiras atuais:

| Tabela | Coluna | Regra hoje | Efeito |
|---|---|---|---|
| pulse_responses | respondent_id | nenhuma | bloqueia (erro do print) |
| pulse_surveys | created_by | nenhuma | bloqueia |
| medical_leaves | person_id, created_by | RESTRICT | bloqueia |
| special_approvals | manager_id | RESTRICT | bloqueia |
| payment_day_change_requests | reviewed_by | nenhuma | bloqueia |

As demais (solicitações, kudos, pontos, perfis, pares de peer review, preferências) já apagam ou desvinculam automaticamente.

## O que será feito

1. Migração ajustando as regras das chaves acima:
   - `pulse_responses.respondent_id`, `pulse_surveys.created_by`, `medical_leaves.person_id`, `special_approvals.manager_id`: apagam junto com a pessoa (histórico pessoal daquele colaborador).
   - `medical_leaves.created_by` e `payment_day_change_requests.reviewed_by`: apenas perdem a referência (ficam em branco), preservando o registro de quem foi afetado.
2. Antes de excluir, a tela de Administração passa a mostrar um resumo do que será removido junto (respostas de pulse, pesquisas criadas, licenças médicas, aprovações especiais), reaproveitando o diálogo de confirmação já existente.
3. Mensagem de erro amigável caso ainda reste algum vínculo, em vez do texto técnico de constraint.

## Alternativa (se preferir preservar histórico)

Em vez de apagar, marcar a pessoa como inativa (`ativo = false`) e ocultá-la das listas. Nada é perdido, mas o registro continua no banco. Posso trocar o plano para essa abordagem — ou aplicar as duas (inativar como padrão, excluir de vez apenas para admin).

## Detalhes técnicos

- Uma única migração com `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT ... ON DELETE CASCADE|SET NULL`.
- `get_manager_deletion_impact` ganha as novas contagens; `src/pages/Admin.tsx` (`handleDelete`) exibe o resumo e traduz o erro `23503`.
- Sem mudanças em RLS ou grants.
