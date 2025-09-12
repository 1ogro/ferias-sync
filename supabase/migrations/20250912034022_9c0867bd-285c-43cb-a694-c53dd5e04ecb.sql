-- 1. Update status check constraint to include RASCUNHO
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
  'EM_ANDAMENTO'::text,
  'RASCUNHO'::text
]));

-- 2. Make inicio and fim columns nullable for drafts
ALTER TABLE public.requests ALTER COLUMN inicio DROP NOT NULL;
ALTER TABLE public.requests ALTER COLUMN fim DROP NOT NULL;

-- 3. Add constraint: dates required when not draft
ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_dates_required_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_dates_required_check
CHECK (status = 'RASCUNHO' OR (inicio IS NOT NULL AND fim IS NOT NULL));

-- 4. Add constraint: inicio <= fim when both dates exist
ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_date_order_check;  
ALTER TABLE public.requests ADD CONSTRAINT requests_date_order_check
CHECK (inicio IS NULL OR fim IS NULL OR inicio <= fim);

-- 5. Allow users to update their own draft requests
CREATE POLICY "Users can update their own draft requests"
ON public.requests FOR UPDATE
USING (
  requester_id IN (SELECT profiles.person_id FROM profiles WHERE profiles.user_id = auth.uid())
  AND status = 'RASCUNHO'
);

-- 6. Allow users to insert their own audit logs
CREATE POLICY "Users can insert their own audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (
  actor_id IN (SELECT profiles.person_id FROM profiles WHERE profiles.user_id = auth.uid())
);