-- Helper: is the current user the GERENTE responsible for this request's team?
CREATE OR REPLACE FUNCTION public.is_final_approver_for(_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.requests r
    JOIN public.people req ON req.id = r.requester_id
    JOIN public.profiles prof ON prof.user_id = auth.uid()
    JOIN public.people me ON me.id = prof.person_id
    WHERE r.id = _request_id
      AND me.papel = 'GERENTE'
      AND me.ativo = true
      AND me.sub_time IS NOT NULL
      AND me.sub_time = req.sub_time
      AND me.id <> req.id
  )
$$;

-- Helper: is the current user the GERENTE responsible for this person's team?
CREATE OR REPLACE FUNCTION public.is_team_final_approver_of_person(_person_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.people req
    JOIN public.profiles prof ON prof.user_id = auth.uid()
    JOIN public.people me ON me.id = prof.person_id
    WHERE req.id = _person_id
      AND me.papel = 'GERENTE'
      AND me.ativo = true
      AND me.sub_time IS NOT NULL
      AND me.sub_time = req.sub_time
      AND me.id <> req.id
  )
$$;

-- Allow GERENTE_2 approval level
ALTER TABLE public.approvals DROP CONSTRAINT IF EXISTS approvals_level_check;
ALTER TABLE public.approvals ADD CONSTRAINT approvals_level_check
  CHECK (level = ANY (ARRAY['GESTOR_1'::text, 'GERENTE_2'::text, 'DIRETOR_2'::text, 'SOLICITANTE'::text]));

-- Team manager (GERENTE) can decide requests of their team
DROP POLICY IF EXISTS "Team gerente can update team requests" ON public.requests;
CREATE POLICY "Team gerente can update team requests"
ON public.requests
FOR UPDATE
TO authenticated
USING (public.is_final_approver_for(id) AND status <> 'RASCUNHO')
WITH CHECK (public.is_final_approver_for(id));

-- Team manager (GERENTE) can record approvals for their team
DROP POLICY IF EXISTS "Team gerente can create approvals" ON public.approvals;
CREATE POLICY "Team gerente can create approvals"
ON public.approvals
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_final_approver_for(request_id)
  AND approver_id IN (SELECT person_id FROM public.profiles WHERE user_id = auth.uid())
);
