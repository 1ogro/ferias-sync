
-- Restrict public-role policies to authenticated only
ALTER POLICY "Directors can manage medical leaves" ON public.medical_leaves TO authenticated;
ALTER POLICY "Users can view medical leaves in their team" ON public.medical_leaves TO authenticated;

ALTER POLICY "Diretores podem criar cadastros pendentes" ON public.pending_people TO authenticated;
ALTER POLICY "Diretores podem editar cadastros pendentes" ON public.pending_people TO authenticated;
ALTER POLICY "Diretores veem todos cadastros pendentes" ON public.pending_people TO authenticated;
ALTER POLICY "Gestores veem seus cadastros" ON public.pending_people TO authenticated;

ALTER POLICY "Admins can view all people" ON public.people TO authenticated;
ALTER POLICY "Managers can view direct reports" ON public.people TO authenticated;
ALTER POLICY "Only admins can delete people" ON public.people TO authenticated;
ALTER POLICY "Only admins can insert people" ON public.people TO authenticated;
ALTER POLICY "Only admins can update people" ON public.people TO authenticated;
ALTER POLICY "Users can view their own data" ON public.people TO authenticated;

ALTER POLICY "Directors can delete all requests" ON public.requests TO authenticated;
ALTER POLICY "Directors can update all requests" ON public.requests TO authenticated;
ALTER POLICY "Managers can delete team requests" ON public.requests TO authenticated;
ALTER POLICY "Managers can update team requests" ON public.requests TO authenticated;
ALTER POLICY "Managers can view their team requests" ON public.requests TO authenticated;
ALTER POLICY "Users can create their own requests or directors can create for" ON public.requests TO authenticated;
ALTER POLICY "Users can delete their own non-approved requests" ON public.requests TO authenticated;
ALTER POLICY "Users can update pending requests for corrections" ON public.requests TO authenticated;
ALTER POLICY "Users can update their own draft requests" ON public.requests TO authenticated;
ALTER POLICY "Users can view their own requests" ON public.requests TO authenticated;

ALTER POLICY "Managers and directors can view special approvals" ON public.special_approvals TO authenticated;
ALTER POLICY "Managers can create special approvals" ON public.special_approvals TO authenticated;

ALTER POLICY "Directors and managers can view capacity alerts" ON public.team_capacity_alerts TO authenticated;
ALTER POLICY "System can manage capacity alerts" ON public.team_capacity_alerts TO authenticated;

ALTER POLICY "Admins can manage vacation balances" ON public.vacation_balances TO authenticated;
ALTER POLICY "Admins can view all vacation balances" ON public.vacation_balances TO authenticated;
ALTER POLICY "Users can view their own vacation balances" ON public.vacation_balances TO authenticated;

-- Kudos: make immutable except for admins/directors
CREATE POLICY "Only admins can update kudos"
ON public.kudos
FOR UPDATE
TO authenticated
USING (public.is_admin_or_director())
WITH CHECK (public.is_admin_or_director());

CREATE POLICY "Only admins can delete kudos"
ON public.kudos
FOR DELETE
TO authenticated
USING (public.is_admin_or_director());
