
CREATE OR REPLACE FUNCTION public.is_in_my_manager_scope(_person_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.is_admin_or_director()
    OR EXISTS (
      SELECT 1
      FROM public.profiles prof
      JOIN public.people me ON me.id = prof.person_id
      JOIN public.people target ON target.id = _person_id
      WHERE prof.user_id = auth.uid()
        AND (
          target.id = me.id
          OR target.gestor_id = me.id
          OR (
            me.papel = 'GERENTE'
            AND me.sub_time IS NOT NULL
            AND target.sub_time = me.sub_time
          )
        )
    );
$function$;

-- people
DROP POLICY IF EXISTS "Manager level can view all people" ON public.people;
CREATE POLICY "Manager level can view people in scope"
ON public.people FOR SELECT TO authenticated
USING (public.is_in_my_manager_scope(id));

-- medical_leaves
DROP POLICY IF EXISTS "Manager level can manage medical leaves" ON public.medical_leaves;
CREATE POLICY "Manager level can manage medical leaves in scope"
ON public.medical_leaves FOR ALL TO authenticated
USING (public.is_manager_level() AND public.is_in_my_manager_scope(person_id))
WITH CHECK (public.is_manager_level() AND public.is_in_my_manager_scope(person_id));

-- vacation_balances
DROP POLICY IF EXISTS "Manager level can view all vacation balances" ON public.vacation_balances;
CREATE POLICY "Manager level can view vacation balances in scope"
ON public.vacation_balances FOR SELECT TO authenticated
USING (public.is_manager_level() AND public.is_in_my_manager_scope(person_id));

-- requests
DROP POLICY IF EXISTS "Manager level can view all requests" ON public.requests;
CREATE POLICY "Manager level can view requests in scope"
ON public.requests FOR SELECT TO authenticated
USING (public.is_manager_level() AND public.is_in_my_manager_scope(requester_id));
