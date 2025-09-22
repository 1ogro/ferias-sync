-- Drop existing restrictive update policies
DROP POLICY IF EXISTS "Users can update their own draft requests" ON requests;
DROP POLICY IF EXISTS "Users can update their own pending requests" ON requests;

-- Create new policies for managers and directors to approve requests

-- Allow managers to update requests from their direct subordinates
CREATE POLICY "Managers can update subordinate requests" 
ON requests 
FOR UPDATE 
USING (
  requester_id IN (
    SELECT p.id 
    FROM people p
    JOIN profiles prof ON prof.person_id = p.gestor_id
    WHERE prof.user_id = auth.uid()
  )
  AND status IN ('EM_ANALISE_GESTOR', 'INFORMACOES_ADICIONAIS')
);

-- Allow directors to update any request in analysis
CREATE POLICY "Directors can update requests in analysis" 
ON requests 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 
    FROM profiles prof
    JOIN people per ON prof.person_id = per.id
    WHERE prof.user_id = auth.uid() 
    AND per.papel IN ('DIRETOR', 'ADMIN')
  )
  AND status IN ('EM_ANALISE_DIRETOR', 'EM_ANALISE_GESTOR', 'INFORMACOES_ADICIONAIS')
);

-- Allow users to update their own draft requests (restore this specific case)
CREATE POLICY "Users can update their own draft requests" 
ON requests 
FOR UPDATE 
USING (
  requester_id IN (
    SELECT person_id 
    FROM profiles 
    WHERE user_id = auth.uid()
  ) 
  AND status = 'RASCUNHO'
);

-- Allow users to update their own pending requests for corrections
CREATE POLICY "Users can update pending requests for corrections" 
ON requests 
FOR UPDATE 
USING (
  requester_id IN (
    SELECT person_id 
    FROM profiles 
    WHERE user_id = auth.uid()
  ) 
  AND status IN ('PENDENTE', 'INFORMACOES_ADICIONAIS')
);