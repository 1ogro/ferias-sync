-- Corrigir o status da solicitação do Vinicius para aparecer na caixa de entrada do diretor
UPDATE public.requests 
SET status = 'EM_ANALISE_DIRETOR', updated_at = now()
WHERE id = 'd853b875-b8ea-4a3f-9e6f-0dd4454997f4' 
  AND status = 'PENDENTE';