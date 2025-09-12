-- Drop and recreate the status check constraint to include EM_ANDAMENTO
ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_status_check;

ALTER TABLE public.requests ADD CONSTRAINT requests_status_check 
CHECK (status = ANY (ARRAY[
    'PENDENTE'::text, 
    'EM_ANALISE_GESTOR'::text, 
    'APROVADO_1NIVEL'::text, 
    'EM_ANALISE_DIRETOR'::text, 
    'APROVADO_FINAL'::text, 
    'REPROVADO'::text, 
    'CANCELADO'::text, 
    'REALIZADO'::text,
    'EM_ANDAMENTO'::text
]));

-- Now insert the Pedro Belsito request with EM_ANDAMENTO status
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'EM_ANDAMENTO', '2025-09-01', '2025-09-20', '0'
FROM public.people p
WHERE p.nome = 'Pedro Belsito'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-09-01'
);