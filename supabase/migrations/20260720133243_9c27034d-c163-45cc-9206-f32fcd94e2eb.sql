
-- engagement_points: make write-deny explicit for client roles (writes only via SECURITY DEFINER / service_role)
CREATE POLICY "engagement_points_no_client_insert" ON public.engagement_points
  AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "engagement_points_no_client_update" ON public.engagement_points
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "engagement_points_no_client_delete" ON public.engagement_points
  AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

-- pulse_responses: allow respondent and subject to view their own responses
CREATE POLICY "pulse_responses_select_self_respondent" ON public.pulse_responses
  FOR SELECT TO authenticated
  USING (respondent_id = current_person_id()::text);

CREATE POLICY "pulse_responses_select_self_subject" ON public.pulse_responses
  FOR SELECT TO authenticated
  USING (subject_id = current_person_id()::text);

-- Explicit deny of update/delete from client roles (writes only via SECURITY DEFINER / service_role)
CREATE POLICY "pulse_responses_no_client_update" ON public.pulse_responses
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "pulse_responses_no_client_delete" ON public.pulse_responses
  AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);
