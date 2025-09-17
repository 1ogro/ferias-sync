-- Update existing PENDENTE requests to proper status based on their manager hierarchy
-- This fixes the 8 pending requests that are stuck

UPDATE requests 
SET status = CASE 
  -- If requester's manager is a DIRETOR, move to director analysis
  WHEN EXISTS (
    SELECT 1 FROM people p1 
    JOIN people p2 ON p1.gestor_id = p2.id 
    WHERE p1.id = requests.requester_id 
    AND p2.papel = 'DIRETOR'
  ) THEN 'EM_ANALISE_DIRETOR'
  -- If requester has a manager, move to manager analysis
  WHEN EXISTS (
    SELECT 1 FROM people p 
    WHERE p.id = requests.requester_id 
    AND p.gestor_id IS NOT NULL
  ) THEN 'EM_ANALISE_GESTOR'
  -- Otherwise keep as pending (shouldn't happen but safety fallback)
  ELSE 'PENDENTE'
END
WHERE status = 'PENDENTE' 
AND requester_id IS NOT NULL;