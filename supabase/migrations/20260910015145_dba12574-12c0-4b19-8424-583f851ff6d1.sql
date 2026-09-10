CREATE OR REPLACE FUNCTION public.get_wellbeing_report(p_weeks integer DEFAULT 12, p_sub_time text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  SELECT r.id, r.run_id, r.respondent_id, r.scale_value, coalesce(p.sub_time,'Sem time') AS team, s.kind,
   date_trunc('week',r.submitted_at AT TIME ZONE 'America/Sao_Paulo')::date AS wk
  FROM public.pulse_responses r JOIN public.pulse_runs run ON run.id=r.run_id
  JOIN surveys s ON s.id=run.survey_id JOIN public.pulse_questions q ON q.id=r.question_id
  LEFT JOIN public.people p ON p.id=r.respondent_id
  WHERE r.scale_value IS NOT NULL AND q.question_type='scale_1_5'
   AND r.submitted_at>=v_from AND r.submitted_at<=now()
 ), deliveries AS (
  SELECT DISTINCT rr.run_id,rr.person_id,coalesce(p.sub_time,'Sem time') AS team,s.kind,
   date_trunc('week',rr.sent_at AT TIME ZONE 'America/Sao_Paulo')::date AS wk,
   EXISTS (SELECT 1 FROM public.pulse_responses r WHERE r.run_id=rr.run_id AND r.respondent_id=rr.person_id
    AND r.submitted_at>=rr.sent_at AND r.submitted_at<=now()
    AND (r.scale_value IS NOT NULL OR nullif(btrim(r.text_value),'') IS NOT NULL)) AS answered
  FROM public.pulse_run_recipients rr JOIN public.pulse_runs run ON run.id=rr.run_id
  JOIN surveys s ON s.id=run.survey_id LEFT JOIN public.people p ON p.id=rr.person_id
  WHERE rr.sent_at>=v_from AND rr.sent_at<=now()
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
 ), primary_hidden AS (
  SELECT DISTINCT team FROM aggregated WHERE scope='team' AND respondent_count BETWEEN 1 AND 2
 ), hidden_people AS (
  SELECT count(DISTINCT n.respondent_id) AS n FROM notes n JOIN primary_hidden h ON h.team=n.team
 ), extra_hidden AS (
  SELECT a.team FROM aggregated a WHERE a.scope='team' AND a.level='period' AND a.kind='both'
   AND a.respondent_count>=3 AND NOT EXISTS (SELECT 1 FROM primary_hidden h WHERE h.team=a.team)
   AND (SELECT n FROM hidden_people) BETWEEN 1 AND 2
  ORDER BY a.respondent_count,a.team LIMIT 1
 ), hidden AS (SELECT team FROM primary_hidden UNION SELECT team FROM extra_hidden),
 total_protection AS (
  SELECT exists(SELECT 1 FROM aggregated WHERE scope='total' AND respondent_count BETWEEN 1 AND 2) AS protect
 ), safe AS (
  SELECT a.*, CASE WHEN a.response_count=0 THEN 'empty'
   WHEN a.respondent_count<3 OR (a.scope='team' AND EXISTS (SELECT 1 FROM hidden h WHERE h.team=a.team))
    OR (a.scope='total' AND (SELECT protect FROM total_protection)) THEN 'protected' ELSE 'available' END AS status
  FROM aggregated a
 ), selected AS (
  SELECT level,wk AS week_start,scope,team AS sub_time,kind,
   CASE WHEN status='available' THEN round(avg_value,2) ELSE NULL END AS avg_value,
   response_count,respondent_count,recipients_count,responded_deliveries,status
  FROM safe WHERE p_sub_time IS NULL OR (scope='team' AND team=p_sub_time)
 )
 SELECT jsonb_build_object('period_start',v_start,'period_end',v_end,'weeks',v_weeks,
  'teams',coalesce((SELECT jsonb_agg(team ORDER BY team) FROM teams),'[]'::jsonb),
  'rows',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.level,x.week_start,x.scope,x.sub_time,x.kind) FROM selected x),'[]'::jsonb)) INTO v_result;
 RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_wellbeing_report(integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_wellbeing_report(integer,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_wellbeing_team_weekly(p_weeks integer DEFAULT 12,p_sub_time text DEFAULT NULL)
RETURNS TABLE(week_start date,sub_time text,kind text,avg_value numeric,response_count integer,respondent_count integer,recipients_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT x.week_start,x.sub_time,x.kind,x.avg_value,x.response_count,x.respondent_count,x.recipients_count
 FROM jsonb_to_recordset(public.get_wellbeing_report(p_weeks,p_sub_time)->'rows') AS x(
 level text,week_start date,scope text,sub_time text,kind text,avg_value numeric,response_count integer,respondent_count integer,recipients_count integer)
 WHERE x.level='week' AND x.scope='team' AND x.kind IN ('checkin','checkout');
$$;
REVOKE ALL ON FUNCTION public.get_wellbeing_team_weekly(integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_wellbeing_team_weekly(integer,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.validate_pulse_response_survey()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.pulse_questions q JOIN public.pulse_runs r ON r.survey_id=q.survey_id
   WHERE q.id=NEW.question_id AND r.id=NEW.run_id) THEN
  RAISE EXCEPTION 'A pergunta deve pertencer à pesquisa do disparo' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_pulse_response_survey() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER pulse_response_survey_integrity BEFORE INSERT OR UPDATE OF run_id,question_id ON public.pulse_responses
 FOR EACH ROW EXECUTE FUNCTION public.validate_pulse_response_survey();