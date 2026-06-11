
DROP POLICY IF EXISTS "Managers can create approvals" ON public.approvals;
CREATE POLICY "Managers can create approvals"
ON public.approvals
FOR INSERT
TO authenticated
WITH CHECK (
  approver_id IN (
    SELECT prof.person_id
    FROM profiles prof
    JOIN people per ON per.id = prof.person_id
    WHERE prof.user_id = auth.uid()
      AND (per.is_admin = true OR per.papel IN ('GESTOR','DIRETOR','ADMIN'))
  )
);

DROP POLICY IF EXISTS "Users can insert their own audit logs" ON public.audit_logs;

DROP POLICY IF EXISTS "Users can view their own medical leaves" ON public.medical_leaves;
CREATE POLICY "Users can view their own medical leaves"
ON public.medical_leaves
FOR SELECT
TO authenticated
USING (
  person_id IN (SELECT person_id FROM profiles WHERE user_id = auth.uid())
);

REVOKE EXECUTE ON FUNCTION public.recalculate_vacation_balance(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_profile_for_current_user(text, text, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_maternity_leave(text, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_vacation_summary(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_collaborator_onboarding_data(text, date, text, integer, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_contract_data_for_current_user(date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_contract_data_for_current_user(date, text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_pending_person(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_pending_person(uuid, text, text, text, text, text, text, text, text, date, text, date, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_profiles() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.link_profile_with_figma_email(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_manager_deletion_impact(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reassign_and_delete_person(text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_director_emails() FROM PUBLIC, anon;
