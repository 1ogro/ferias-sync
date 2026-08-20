CREATE POLICY "Gestores can view their team vacation balances"
ON public.vacation_balances
FOR SELECT
TO authenticated
USING (
  person_id IN (
    SELECT p.id FROM public.people p
    WHERE p.gestor_id = public.current_person_id()
  )
);