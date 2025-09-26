-- Fix RLS policies with proper WITH CHECK clauses to resolve update violations

-- Drop all existing update policies that are causing issues
DROP POLICY IF EXISTS "Directors can update requests in analysis" ON public.requests;
DROP POLICY IF EXISTS "Managers can update subordinate requests" ON public.requests;
DROP POLICY IF EXISTS "Users can update their own draft requests" ON public.requests;
DROP POLICY IF EXISTS "Users can update pending requests for corrections" ON public.requests;

-- Create Directors policy with separate USING and WITH CHECK
CREATE POLICY "Directors can update requests in analysis" 
ON public.requests 
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
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM profiles prof
    JOIN people per ON prof.person_id = per.id
    WHERE prof.user_id = auth.uid() 
    AND per.papel IN ('DIRETOR', 'ADMIN')
  )
);

-- Create Managers policy with separate USING and WITH CHECK
CREATE POLICY "Managers can update subordinate requests" 
ON public.requests 
FOR UPDATE 
USING (
  requester_id IN (
    SELECT p.id
    FROM people p
    JOIN profiles prof ON p.gestor_id = prof.person_id
    WHERE prof.user_id = auth.uid()
  )
  AND status IN ('EM_ANALISE_GESTOR', 'INFORMACOES_ADICIONAIS')
)
WITH CHECK (
  requester_id IN (
    SELECT p.id
    FROM people p
    JOIN profiles prof ON p.gestor_id = prof.person_id
    WHERE prof.user_id = auth.uid()
  )
);

-- Create Users policy for draft requests with separate USING and WITH CHECK
CREATE POLICY "Users can update their own draft requests" 
ON public.requests 
FOR UPDATE 
USING (
  requester_id IN (
    SELECT profiles.person_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  )
  AND status = 'RASCUNHO'
)
WITH CHECK (
  requester_id IN (
    SELECT profiles.person_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  )
);

-- Create Users policy for pending requests with separate USING and WITH CHECK
CREATE POLICY "Users can update pending requests for corrections" 
ON public.requests 
FOR UPDATE 
USING (
  requester_id IN (
    SELECT profiles.person_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  )
  AND status IN ('PENDENTE', 'INFORMACOES_ADICIONAIS')
)
WITH CHECK (
  requester_id IN (
    SELECT profiles.person_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  )
);