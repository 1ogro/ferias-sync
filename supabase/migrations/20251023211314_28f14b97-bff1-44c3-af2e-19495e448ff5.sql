-- ============================================
-- ATUALIZAR POLÍTICAS RLS PARA PERMITIR EDIÇÃO/EXCLUSÃO POR GESTORES E DIRETORES
-- ============================================

-- 1. Remover políticas antigas de UPDATE para gestores
DROP POLICY IF EXISTS "Managers can update subordinate requests" ON public.requests;

-- 2. Criar nova política expandida de UPDATE para gestores
-- Permite que gestores editem TODAS as solicitações de seus subordinados diretos (exceto rascunhos)
CREATE POLICY "Managers can update team requests" 
ON public.requests
FOR UPDATE
USING (
  requester_id IN (
    SELECT p.id
    FROM people p
    JOIN profiles prof ON p.gestor_id = prof.person_id
    WHERE prof.user_id = auth.uid()
  )
  AND status != 'RASCUNHO'
)
WITH CHECK (
  requester_id IN (
    SELECT p.id
    FROM people p
    JOIN profiles prof ON p.gestor_id = prof.person_id
    WHERE prof.user_id = auth.uid()
  )
);

-- 3. Remover política antiga de UPDATE para diretores
DROP POLICY IF EXISTS "Directors can update requests in analysis" ON public.requests;

-- 4. Criar nova política expandida de UPDATE para diretores/admins
-- Permite que diretores/admins editem TODAS as solicitações (exceto rascunhos)
CREATE POLICY "Directors can update all requests" 
ON public.requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM profiles prof
    JOIN people per ON prof.person_id = per.id
    WHERE prof.user_id = auth.uid()
    AND (per.papel IN ('DIRETOR', 'ADMIN') OR per.is_admin = true)
  )
  AND status != 'RASCUNHO'
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles prof
    JOIN people per ON prof.person_id = per.id
    WHERE prof.user_id = auth.uid()
    AND (per.papel IN ('DIRETOR', 'ADMIN') OR per.is_admin = true)
  )
);

-- 5. Criar nova política DELETE para gestores
-- Permite que gestores excluam solicitações de subordinados diretos (exceto rascunhos)
CREATE POLICY "Managers can delete team requests" 
ON public.requests
FOR DELETE
USING (
  requester_id IN (
    SELECT p.id
    FROM people p
    JOIN profiles prof ON p.gestor_id = prof.person_id
    WHERE prof.user_id = auth.uid()
  )
  AND status != 'RASCUNHO'
);

-- 6. Criar nova política DELETE para diretores/admins
-- Permite que diretores/admins excluam qualquer solicitação (exceto rascunhos)
CREATE POLICY "Directors can delete all requests" 
ON public.requests
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM profiles prof
    JOIN people per ON prof.person_id = per.id
    WHERE prof.user_id = auth.uid()
    AND (per.papel IN ('DIRETOR', 'ADMIN') OR per.is_admin = true)
  )
  AND status != 'RASCUNHO'
);