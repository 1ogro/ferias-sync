CREATE OR REPLACE FUNCTION public.get_pulse_weekly_trend(
  p_survey_id uuid,
  p_weeks integer DEFAULT 12,
  p_sub_time text DEFAULT NULL,
  p_question_id uuid DEFAULT NULL
)
RETURNS TABLE(week_start date, avg_value numeric, response_count integer, respondent_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller text;
  v_is_admin boolean;
  v_is_gerente boolean;
  v_creator text;
  v_weeks integer := GREATEST(1, LEAST(COALESCE(p_weeks, 12), 104));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_caller := public.current_person_id();
  v_is_admin := public.is_admin_or_director();
  v_is_gerente := public.is_gerente_only();

  SELECT created_by INTO v_creator FROM public.pulse_surveys s WHERE s.id = p_survey_id;
  IF v_creator IS NULL THEN
    RETURN;
  END IF;

  IF NOT (v_is_admin OR v_is_gerente OR v_creator = v_caller) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH weeks AS (
    SELECT (date_trunc('week', now())::date - (g * 7))::date AS wk
    FROM generate_series(0, v_weeks - 1) AS g
  ),
  rows AS (
    SELECT
      date_trunc('week', resp.submitted_at)::date AS wk,
      resp.scale_value,
      resp.respondent_id
    FROM public.pulse_responses resp
    JOIN public.pulse_runs r ON r.id = resp.run_id
    LEFT JOIN public.people p ON p.id = resp.respondent_id
    WHERE r.survey_id = p_survey_id
      AND resp.scale_value IS NOT NULL
      AND resp.submitted_at >= (date_trunc('week', now()) - ((v_weeks - 1) * INTERVAL '7 days'))
      AND (p_sub_time IS NULL OR p.sub_time = p_sub_time)
      AND (p_question_id IS NULL OR resp.question_id = p_question_id)
      AND (
        NOT v_is_gerente
        OR v_creator = v_caller
        OR COALESCE(p.papel, '') NOT IN ('DIRETOR','GERENTE')
      )
  ),
  agg AS (
    SELECT
      rows.wk,
      AVG(rows.scale_value)::numeric AS avg_value,
      COUNT(*)::integer AS response_count,
      COUNT(DISTINCT rows.respondent_id)::integer AS respondent_count
    FROM rows
    GROUP BY rows.wk
  )
  SELECT
    w.wk,
    CASE WHEN COALESCE(a.respondent_count, 0) >= 3 THEN ROUND(a.avg_value, 2) ELSE NULL END,
    COALESCE(a.response_count, 0),
    COALESCE(a.respondent_count, 0)
  FROM weeks w
  LEFT JOIN agg a ON a.wk = w.wk
  ORDER BY w.wk ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_pulse_weekly_trend(uuid, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pulse_weekly_trend(uuid, integer, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_pulse_survey_teams(p_survey_id uuid)
RETURNS TABLE(sub_time text, response_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller text;
  v_is_admin boolean;
  v_is_gerente boolean;
  v_creator text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_caller := public.current_person_id();
  v_is_admin := public.is_admin_or_director();
  v_is_gerente := public.is_gerente_only();

  SELECT created_by INTO v_creator FROM public.pulse_surveys s WHERE s.id = p_survey_id;
  IF v_creator IS NULL THEN
    RETURN;
  END IF;

  IF NOT (v_is_admin OR v_is_gerente OR v_creator = v_caller) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT p.sub_time, COUNT(*)::integer
  FROM public.pulse_responses resp
  JOIN public.pulse_runs r ON r.id = resp.run_id
  JOIN public.people p ON p.id = resp.respondent_id
  WHERE r.survey_id = p_survey_id
    AND p.sub_time IS NOT NULL
    AND (
      NOT v_is_gerente
      OR v_creator = v_caller
      OR COALESCE(p.papel, '') NOT IN ('DIRETOR','GERENTE')
    )
  GROUP BY p.sub_time
  ORDER BY p.sub_time;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_pulse_survey_teams(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pulse_survey_teams(uuid) TO authenticated;