-- Fix RLS policies for requests table
-- The manager-subordinate relationship was inverted in the current policies

-- Drop existing policies that have incorrect logic
DROP POLICY IF EXISTS "Managers can update subordinate requests" ON public.requests;
DROP POLICY IF EXISTS "Managers can view their team requests" ON public.requests;

-- Create corrected policy for managers to update subordinate requests
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
);

-- Create corrected policy for managers to view their team requests
CREATE POLICY "Managers can view their team requests" 
ON public.requests 
FOR SELECT 
USING (
  requester_id IN (
    SELECT p.id
    FROM people p
    JOIN profiles prof ON p.gestor_id = prof.person_id
    WHERE prof.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 
    FROM profiles prof
    JOIN people per ON prof.person_id = per.id
    WHERE prof.user_id = auth.uid() 
    AND per.papel IN ('DIRETOR', 'ADMIN')
  )
);