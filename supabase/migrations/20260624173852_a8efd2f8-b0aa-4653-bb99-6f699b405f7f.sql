DROP VIEW IF EXISTS public.pulse_responses_safe;

CREATE VIEW public.pulse_responses_safe
WITH (security_invoker=true) AS
SELECT
  resp.id,
  resp.run_id,
  resp.question_id,
  CASE WHEN s.anonymous THEN NULL ELSE resp.respondent_id END AS respondent_id,
  CASE WHEN s.anonymous THEN NULL ELSE p.nome END AS respondent_name,
  CASE
    WHEN s.anonymous THEN 'R' || dense_rank() OVER (PARTITION BY r.survey_id ORDER BY resp.respondent_id)
    ELSE NULL
  END AS anonymous_label,
  resp.scale_value,
  resp.text_value,
  resp.submitted_at,
  r.survey_id
FROM public.pulse_responses resp
JOIN public.pulse_runs r ON r.id = resp.run_id
JOIN public.pulse_surveys s ON s.id = r.survey_id
LEFT JOIN public.people p ON p.id = resp.respondent_id
WHERE public.is_admin_or_director() OR s.created_by = public.current_person_id();

GRANT SELECT ON public.pulse_responses_safe TO authenticated;