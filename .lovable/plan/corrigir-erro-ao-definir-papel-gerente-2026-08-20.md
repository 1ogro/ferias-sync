# Corrigir erro ao definir papel GERENTE

## Problema
O papel GERENTE foi implementado no frontend e nas regras de aprovação, mas a restrição do banco na tabela `people` ainda só aceita `COLABORADOR`, `GESTOR`, `DIRETOR` e `ADMIN`. Por isso, salvar a Katja Aquino como gerente falha com `people_papel_check`.

Verificado no banco:
`CHECK (papel = ANY (ARRAY['COLABORADOR','GESTOR','DIRETOR','ADMIN']))`

## Correção
1. Migração: remover `people_papel_check` e recriá-la incluindo `GERENTE` (mantendo os demais valores).
2. Conferir se `pending_people` tem restrição equivalente — hoje não tem, então nada a alterar lá.
3. Após a migração, alterar o papel da Katja Aquino para GERENTE e confirmar que o registro persistiu.

## Detalhes técnicos
- Migração:
  - `ALTER TABLE public.people DROP CONSTRAINT people_papel_check;`
  - `ALTER TABLE public.people ADD CONSTRAINT people_papel_check CHECK (papel IS NULL OR papel IN ('COLABORADOR','GESTOR','GERENTE','DIRETOR','ADMIN'));`
- Nenhuma mudança de código de aplicação é necessária: `src/lib/types.ts`, `approvalRouting.ts` e os formulários já contemplam GERENTE.
