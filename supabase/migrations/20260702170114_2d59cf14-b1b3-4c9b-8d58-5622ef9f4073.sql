DROP POLICY IF EXISTS "Gestores podem criar cadastros pendentes" ON public.pending_people;

CREATE POLICY "Gestores podem criar cadastros pendentes"
ON public.pending_people
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles prof
    JOIN public.people per ON per.id = prof.person_id
    WHERE prof.user_id = auth.uid()
      AND per.ativo = true
      AND per.papel = 'GESTOR'
      AND per.id = pending_people.created_by
  )
);