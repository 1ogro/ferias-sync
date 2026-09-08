CREATE OR REPLACE FUNCTION public.get_wellbeing_team_weekly(p_weeks integer DEFAULT 12, p_sub_time text DEFAULT NULL)
RETURNS TABLE(
  week_start date,
  sub_time text,
  kind text,
  avg_value numeric,
  response_count integer,
  respondent_count integer,
  recipients_count integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_weeks integer := GREATEST(1, LEAST(COALESCE(p_weeks, 12), 104));
  v_from timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_manager_level() AND NOT EXISTS (
    SELECT 1 FROM profiles pr JOIN people p ON p.id = pr.person_id
    WHERE pr.user_id = auth.uid() AND p.papel = 'GESTOR'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_from := (date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') - ((v_weeks - 1) * INTERVAL '7 days')) AT TIME ZONE 'America/Sao_Paulo';

  RETURN QUERY
  WITH resp AS (
    SELECT
      (date_trunc('week', (r.submitted_at AT TIME ZONE 'America/Sao_Paulo')))::date AS wk,
      COALESCE(pe.sub_time, 'Sem time') AS team,
      CASE WHEN EXTRACT(dow FROM (r.submitted_at AT TIME ZONE 'America/Sao_Paulo'))::int BETWEEN 1 AND 4
           THEN 'checkin' ELSE 'checkout' END AS bucket,
      r.scale_value,
      r.respondent_id
    FROM public.pulse_responses r
    JOIN public.pulse_questions q ON q.id = r.question_id
    JOIN public.pulse_runs run ON run.id = r.run_id
    JOIN public.pulse_surveys s ON s.id = run.survey_id
    LEFT JOIN public.people pe ON pe.id = r.respondent_id
    WHERE q.question_type = 'scale_1_5'
      AND s.kind = 'self'
      AND r.scale_value IS NOT NULL
      AND r.submitted_at >= v_from
      AND (p_sub_time IS NULL OR COALESCE(pe.sub_time, 'Sem time') = p_sub_time)
  ),
  agg AS (
    SELECT wk, team, bucket,
      AVG(scale_value)::numeric AS avg_v,
      COUNT(*)::int AS resp_n,
      COUNT(DISTINCT respondent_id)::int AS people_n
    FROM resp GROUP BY wk, team, bucket
  ),
  rec AS (
    SELECT
      (date_trunc('week', (rr.sent_at AT TIME ZONE 'America/Sao_Paulo')))::date AS wk,
      COALESCE(pe.sub_time, 'Sem time') AS team,
      CASE WHEN EXTRACT(dow FROM (rr.sent_at AT TIME ZONE 'America/Sao_Paulo'))::int BETWEEN 1 AND 4
           THEN 'checkin' ELSE 'checkout' END AS bucket,
      COUNT(DISTINCT rr.person_id)::int AS rec_n
    FROM public.pulse_run_recipients rr
    JOIN public.pulse_runs run ON run.id = rr.run_id
    JOIN public.pulse_surveys s ON s.id = run.survey_id
    LEFT JOIN public.people pe ON pe.id = rr.person_id
    WHERE s.kind = 'self'
      AND rr.sent_at >= v_from
      AND (p_sub_time IS NULL OR COALESCE(pe.sub_time, 'Sem time') = p_sub_time)
    GROUP BY 1, 2, 3
  )
  SELECT
    COALESCE(a.wk, rc.wk),
    COALESCE(a.team, rc.team),
    COALESCE(a.bucket, rc.bucket),
    CASE WHEN COALESCE(a.people_n, 0) >= 3 THEN ROUND(a.avg_v, 2) ELSE NULL END,
    COALESCE(a.resp_n, 0),
    COALESCE(a.people_n, 0),
    COALESCE(rc.rec_n, 0)
  FROM agg a
  FULL OUTER JOIN rec rc ON rc.wk = a.wk AND rc.team = a.team AND rc.bucket = a.bucket
  ORDER BY 1 DESC, 2, 3;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_wellbeing_team_weekly(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wellbeing_team_weekly(integer, text) TO authenticated;