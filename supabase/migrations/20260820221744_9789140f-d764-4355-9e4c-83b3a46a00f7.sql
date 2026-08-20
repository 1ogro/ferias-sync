
DROP POLICY IF EXISTS "Directors and managers can view capacity alerts" ON public.team_capacity_alerts;
DROP POLICY IF EXISTS "Manager level can view capacity alerts" ON public.team_capacity_alerts;

CREATE POLICY "Directors and team managers can view capacity alerts"
ON public.team_capacity_alerts
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_director()
  OR (
    public.is_manager_level()
    AND EXISTS (
      SELECT 1 FROM public.profiles prof
      JOIN public.people per ON per.id = prof.person_id
      WHERE prof.user_id = auth.uid()
        AND per.sub_time = team_capacity_alerts.team_id
    )
  )
);

CREATE POLICY "Admins and directors can update special approvals"
ON public.special_approvals
FOR UPDATE
TO authenticated
USING (public.is_admin_or_director())
WITH CHECK (public.is_admin_or_director());

CREATE POLICY "Admins and directors can delete special approvals"
ON public.special_approvals
FOR DELETE
TO authenticated
USING (public.is_admin_or_director());
