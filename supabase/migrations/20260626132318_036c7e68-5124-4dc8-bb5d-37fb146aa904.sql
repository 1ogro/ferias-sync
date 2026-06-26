
-- Drop the views flagged by lint 0010
DROP VIEW IF EXISTS public.kudos_feed_safe;
DROP VIEW IF EXISTS public.pulse_responses_safe;

-- ============================================================
-- Replacement for kudos_feed_safe: SECURITY DEFINER function
-- exposes the same safe columns (no slack emails) plus joined names.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_kudos_feed(p_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  from_person_id text,
  to_person_id text,
  from_person_nome text,
  to_person_nome text,
  from_slack_name text,
  to_slack_name text,
  from_slack_user_id text,
  to_slack_user_id text,
  pending_from boolean,
  pending_to boolean,
  message text,
  category kudos_category,
  slack_channel_posted text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    k.id,
    k.from_person_id,
    k.to_person_id,
    pf.nome AS from_person_nome,
    pt.nome AS to_person_nome,
    k.from_slack_name,
    k.to_slack_name,
    k.from_slack_user_id,
    k.to_slack_user_id,
    k.pending_from,
    k.pending_to,
    k.message,
    k.category,
    k.slack_channel_posted,
    k.created_at
  FROM public.kudos k
  LEFT JOIN public.people pf ON pf.id = k.from_person_id
  LEFT JOIN public.people pt ON pt.id = k.to_person_id
  WHERE auth.uid() IS NOT NULL
  ORDER BY k.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

REVOKE EXECUTE ON FUNCTION public.get_kudos_feed(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kudos_feed(integer) TO authenticated;

-- ============================================================
-- Replacement for pulse_responses_safe: SECURITY DEFINER function
-- preserves anonymity for anonymous surveys; restricted to admins,
-- directors, and the survey creator.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_pulse_responses_safe(p_survey_id uuid)
RETURNS TABLE(
  id uuid,
  run_id uuid,
  question_id uuid,
  respondent_id text,
  respondent_name text,
  anonymous_label text,
  scale_value integer,
  text_value text,
  submitted_at timestamptz,
  survey_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller text;
  v_is_admin boolean;
  v_creator text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_caller := public.current_person_id();
  v_is_admin := public.is_admin_or_director();

  SELECT created_by INTO v_creator
  FROM public.pulse_surveys
  WHERE pulse_surveys.id = p_survey_id;

  IF v_creator IS NULL THEN
    RETURN;
  END IF;

  IF NOT (v_is_admin OR v_creator = v_caller) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    resp.id,
    resp.run_id,
    resp.question_id,
    CASE WHEN s.anonymous THEN NULL::text ELSE resp.respondent_id END AS respondent_id,
    CASE WHEN s.anonymous THEN NULL::text ELSE p.nome END AS respondent_name,
    CASE
      WHEN s.anonymous
        THEN 'R' || dense_rank() OVER (PARTITION BY r.survey_id ORDER BY resp.respondent_id)::text
      ELSE NULL::text
    END AS anonymous_label,
    resp.scale_value,
    resp.text_value,
    resp.submitted_at,
    r.survey_id
  FROM public.pulse_responses resp
  JOIN public.pulse_runs r ON r.id = resp.run_id
  JOIN public.pulse_surveys s ON s.id = r.survey_id
  LEFT JOIN public.people p ON p.id = resp.respondent_id
  WHERE r.survey_id = p_survey_id
  ORDER BY resp.submitted_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_pulse_responses_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pulse_responses_safe(uuid) TO authenticated;
