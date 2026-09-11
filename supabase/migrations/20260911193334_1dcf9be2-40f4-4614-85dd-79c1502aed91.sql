CREATE OR REPLACE FUNCTION public.is_active_team(_nome text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.teams t
    WHERE lower(btrim(t.nome)) = lower(btrim(coalesce(_nome, '')))
      AND t.ativo IS FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_active_team(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_engagement_team_summary(p_month date, p_scope text DEFAULT 'team'::text, p_include_team text DEFAULT NULL::text)
 RETURNS TABLE(sub_time text, people_count integer, kudos integer, peer_feedbacks integer, external_feedbacks integer, total integer, avg_per_person numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT public.current_person_id() AS pid),
  my_row AS (SELECT p.id, p.sub_time FROM public.people p, me WHERE p.id = me.pid),
  scope AS (
    SELECT p.id,
      CASE
        WHEN p.sub_time IS NOT NULL
         AND (public.is_active_team(p.sub_time) OR p.sub_time = p_include_team)
        THEN p.sub_time
        ELSE 'Sem time'
      END AS sub_time
    FROM public.people p
    WHERE p.ativo IS DISTINCT FROM false
      AND public.can_manage_person_feedback(p.id)
      AND (
        COALESCE(p_scope, 'team') <> 'team'
        OR p.gestor_id = (SELECT pid FROM me)
        OR (p.sub_time IS NOT NULL AND p.sub_time = (SELECT sub_time FROM my_row))
      )
  ),
  bounds AS (
    SELECT date_trunc('month', p_month::timestamptz) AS s,
           date_trunc('month', p_month::timestamptz) + interval '1 month' AS e
  ),
  per_person AS (
    SELECT
      s.id,
      s.sub_time,
      COALESCE(k.c, 0) AS kudos,
      COALESCE(pr.c, 0) AS peer_feedbacks,
      COALESCE(ef.c, 0) AS external_feedbacks
    FROM scope s
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS c FROM public.kudos k, bounds b
      WHERE k.to_person_id = s.id AND k.created_at >= b.s AND k.created_at < b.e
    ) k ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS c FROM public.pulse_responses r, bounds b
      WHERE r.subject_id = s.id AND r.submitted_at >= b.s AND r.submitted_at < b.e
    ) pr ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS c FROM public.external_feedbacks f, bounds b
      WHERE f.person_id = s.id AND f.created_at >= b.s AND f.created_at < b.e
    ) ef ON true
  )
  SELECT
    pp.sub_time,
    count(*)::int AS people_count,
    sum(pp.kudos)::int,
    sum(pp.peer_feedbacks)::int,
    sum(pp.external_feedbacks)::int,
    sum(pp.kudos + pp.peer_feedbacks + pp.external_feedbacks)::int AS total,
    ROUND(
      sum(pp.kudos + pp.peer_feedbacks + pp.external_feedbacks)::numeric
      / NULLIF(count(*), 0), 2
    ) AS avg_per_person
  FROM per_person pp
  GROUP BY pp.sub_time
  ORDER BY pp.sub_time;
$function$;

GRANT EXECUTE ON FUNCTION public.get_engagement_team_summary(date, text, text) TO authenticated;

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
    AND public.is_active_team(p.sub_time)
    AND (
      NOT v_is_gerente
      OR v_creator = v_caller
      OR COALESCE(p.papel, '') NOT IN ('DIRETOR','GERENTE')
    )
  GROUP BY p.sub_time
  ORDER BY p.sub_time;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_wellbeing_report(p_weeks integer DEFAULT 12, p_sub_time text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 v_weeks integer := greatest(1, least(coalesce(p_weeks,12),104));
 v_start date := date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')::date - (v_weeks-1)*7;
 v_end date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 v_from timestamptz := v_start::timestamp AT TIME ZONE 'America/Sao_Paulo';
 v_result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF NOT public.is_manager_level() AND NOT EXISTS (
  SELECT 1 FROM public.profiles pr JOIN public.people p ON p.id=pr.person_id
  WHERE pr.user_id=auth.uid() AND p.papel='GESTOR'
 ) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 WITH surveys AS (
  SELECT s.id, CASE s.id WHEN '6a8e78a7-5fbf-4e2e-bff4-918109b05f5f'::uuid THEN 'checkin' ELSE 'checkout' END AS kind
  FROM public.pulse_surveys s WHERE s.kind='self' AND s.id IN
   ('6a8e78a7-5fbf-4e2e-bff4-918109b05f5f'::uuid,'d7937f3c-4cee-4c7b-bf7a-0b31ae2c1b08'::uuid)
 ), notes AS (
  SELECT r.id, r.run_id, r.respondent_id, r.scale_value,
   CASE WHEN p.sub_time IS NOT NULL AND (public.is_active_team(p.sub_time) OR p.sub_time = p_sub_time)
        THEN p.sub_time ELSE 'Sem time' END AS team,
   s.kind,
   coalesce(run.canonical_week,date_trunc('week',r.submitted_at AT TIME ZONE 'America/Sao_Paulo')::date) AS wk
  FROM public.pulse_responses r JOIN public.pulse_runs run ON run.id=r.run_id
  JOIN surveys s ON s.id=run.survey_id JOIN public.pulse_questions q ON q.id=r.question_id
  LEFT JOIN public.people p ON p.id=r.respondent_id
  WHERE r.scale_value IS NOT NULL AND q.question_type='scale_1_5'
   AND coalesce(run.canonical_week::timestamp AT TIME ZONE 'America/Sao_Paulo',r.submitted_at)>=v_from AND r.submitted_at<=now()
 ), deliveries AS (
  SELECT DISTINCT rr.run_id,rr.person_id,
   CASE WHEN p.sub_time IS NOT NULL AND (public.is_active_team(p.sub_time) OR p.sub_time = p_sub_time)
        THEN p.sub_time ELSE 'Sem time' END AS team,
   s.kind,
   coalesce(run.canonical_week,date_trunc('week',rr.sent_at AT TIME ZONE 'America/Sao_Paulo')::date) AS wk,
   EXISTS (SELECT 1 FROM public.pulse_responses r WHERE r.run_id=rr.run_id AND r.respondent_id=rr.person_id
    AND r.submitted_at<=now()
    AND (r.scale_value IS NOT NULL OR nullif(btrim(r.text_value),'') IS NOT NULL)) AS answered
  FROM public.pulse_run_recipients rr JOIN public.pulse_runs run ON run.id=rr.run_id
  JOIN surveys s ON s.id=run.survey_id LEFT JOIN public.people p ON p.id=rr.person_id
  WHERE coalesce(run.canonical_week::timestamp AT TIME ZONE 'America/Sao_Paulo',rr.sent_at)>=v_from AND rr.sent_at<=now()
 ), teams AS (SELECT team FROM notes UNION SELECT team FROM deliveries),
 periods AS (
  SELECT 'period'::text AS level,NULL::date AS wk
  UNION ALL SELECT 'week', v_start+g*7 FROM generate_series(0,v_weeks-1) g
 ), scopes AS (SELECT 'total'::text AS scope,NULL::text AS team UNION ALL SELECT 'team',team FROM teams),
 cells AS (
  SELECT pe.level,pe.wk,sc.scope,sc.team,k.kind FROM periods pe CROSS JOIN scopes sc
  CROSS JOIN (VALUES ('checkin'::text),('checkout'),('both')) k(kind)
 ), aggregated AS (
  SELECT c.*, n.avg_value,n.response_count,n.respondent_count,d.recipients_count,d.responded_deliveries
  FROM cells c
  CROSS JOIN LATERAL (
   SELECT avg(n.scale_value)::numeric AS avg_value,count(*)::int AS response_count,count(DISTINCT n.respondent_id)::int AS respondent_count
   FROM notes n WHERE (c.wk IS NULL OR n.wk=c.wk) AND (c.scope='total' OR n.team=c.team) AND (c.kind='both' OR n.kind=c.kind)
  ) n
  CROSS JOIN LATERAL (
   SELECT count(*)::int AS recipients_count,count(*) FILTER (WHERE d.answered)::int AS responded_deliveries
   FROM deliveries d WHERE (c.wk IS NULL OR d.wk=c.wk) AND (c.scope='total' OR d.team=c.team) AND (c.kind='both' OR d.kind=c.kind)
  ) d
 ), safe AS (
   SELECT a.*, CASE WHEN response_count=0 THEN 'empty' ELSE 'available' END AS status,
    NULL::text AS protection_reason
   FROM aggregated a
  ), selected AS (
  SELECT level,wk AS week_start,scope,team AS sub_time,kind,
   CASE WHEN status='available' THEN round(avg_value,2) ELSE NULL END AS avg_value,
   response_count,respondent_count,recipients_count,responded_deliveries,status,protection_reason
  FROM safe WHERE p_sub_time IS NULL OR (scope='team' AND team=p_sub_time)
 )
 SELECT jsonb_build_object('period_start',v_start,'period_end',v_end,'weeks',v_weeks,
  'teams',coalesce((SELECT jsonb_agg(team ORDER BY team) FROM teams),'[]'::jsonb),
  'rows',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.level,x.week_start,x.scope,x.sub_time,x.kind) FROM selected x),'[]'::jsonb)) INTO v_result;
 RETURN v_result;
END;
$function$;