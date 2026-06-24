DROP POLICY IF EXISTS pulse_responses_select ON public.pulse_responses;

CREATE POLICY pulse_responses_select
ON public.pulse_responses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pulse_runs r
    JOIN public.pulse_surveys s ON s.id = r.survey_id
    WHERE r.id = pulse_responses.run_id
      AND (public.is_admin_or_director() OR s.created_by = public.current_person_id())
  )
);