CREATE OR REPLACE FUNCTION public.get_person_weekly_wellbeing(p_person_id text, p_weeks integer DEFAULT 8)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
 v_weeks int := greatest(1, least(coalesce(p_weeks,8),52));
 v_start date := date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')::date - (v_weeks-1)*7;
 v_from timestamptz := v_start::timestamp AT TIME ZONE 'America/Sao_Paulo';
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF NOT public.can_manage_person_feedback(p_person_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 RETURN jsonb_build_object(
  'period_start', v_start, 'weeks', v_weeks,
  'pulses', coalesce((
    SELECT jsonb_agg(x ORDER BY x->>'submitted_at') FROM (
     SELECT jsonb_build_object(
      'week_start', coalesce(run.canonical_week, date_trunc('week', r.submitted_at AT TIME ZONE 'America/Sao_Paulo')::date),
      'kind', CASE s.id WHEN '6a8e78a7-5fbf-4e2e-bff4-918109b05f5f'::uuid THEN 'checkin' ELSE 'checkout' END,
      'question', q.question_text, 'question_type', q.question_type,
      'scale_value', r.scale_value, 'text_value', r.text_value, 'submitted_at', r.submitted_at) x
     FROM pulse_responses r JOIN pulse_runs run ON run.id=r.run_id
     JOIN pulse_surveys s ON s.id=run.survey_id JOIN pulse_questions q ON q.id=r.question_id
     WHERE r.respondent_id=p_person_id AND s.anonymous=false
       AND s.id IN ('6a8e78a7-5fbf-4e2e-bff4-918109b05f5f'::uuid,'d7937f3c-4cee-4c7b-bf7a-0b31ae2c1b08'::uuid)
       AND coalesce(run.canonical_week::timestamp AT TIME ZONE 'America/Sao_Paulo', r.submitted_at) >= v_from
       AND (r.scale_value IS NOT NULL OR nullif(btrim(r.text_value),'') IS NOT NULL)
    ) t),'[]'::jsonb),
  'deliveries', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'week_start', coalesce(run.canonical_week, date_trunc('week', rr.sent_at AT TIME ZONE 'America/Sao_Paulo')::date),
      'kind', CASE run.survey_id WHEN '6a8e78a7-5fbf-4e2e-bff4-918109b05f5f'::uuid THEN 'checkin' ELSE 'checkout' END,
      'answered', rr.responded_at IS NOT NULL OR EXISTS(SELECT 1 FROM pulse_responses r WHERE r.run_id=rr.run_id AND r.respondent_id=rr.person_id)))
    FROM pulse_run_recipients rr JOIN pulse_runs run ON run.id=rr.run_id
    WHERE rr.person_id=p_person_id
      AND run.survey_id IN ('6a8e78a7-5fbf-4e2e-bff4-918109b05f5f'::uuid,'d7937f3c-4cee-4c7b-bf7a-0b31ae2c1b08'::uuid)
      AND coalesce(run.canonical_week::timestamp AT TIME ZONE 'America/Sao_Paulo', rr.sent_at) >= v_from),'[]'::jsonb),
  'biscoitos', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'week_start', date_trunc('week', k.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
      'direction', CASE WHEN k.to_person_id=p_person_id THEN 'received' ELSE 'given' END,
      'other_name', CASE WHEN k.to_person_id=p_person_id THEN coalesce(pf.nome,k.from_slack_name) ELSE coalesce(pt.nome,k.to_slack_name) END,
      'category', k.category, 'message', k.message, 'created_at', k.created_at) ORDER BY k.created_at)
    FROM kudos k LEFT JOIN people pf ON pf.id=k.from_person_id LEFT JOIN people pt ON pt.id=k.to_person_id
    WHERE (k.to_person_id=p_person_id OR k.from_person_id=p_person_id) AND k.created_at>=v_from),'[]'::jsonb),
  'feedbacks', coalesce((
    SELECT jsonb_agg(f ORDER BY f->>'date') FROM (
     SELECT jsonb_build_object('week_start', date_trunc('week', r.submitted_at AT TIME ZONE 'America/Sao_Paulo')::date,
       'source','peer','author', CASE WHEN s.peer_anonymous THEN NULL ELSE pa.nome END,
       'question', q.question_text, 'scale_value', r.scale_value, 'text_value', r.text_value, 'date', r.submitted_at) f
     FROM pulse_responses r JOIN pulse_runs run ON run.id=r.run_id JOIN pulse_surveys s ON s.id=run.survey_id
     JOIN pulse_questions q ON q.id=r.question_id LEFT JOIN people pa ON pa.id=r.respondent_id
     WHERE r.subject_id=p_person_id AND r.respondent_id<>p_person_id AND s.kind='peer' AND r.submitted_at>=v_from
       AND (r.scale_value IS NOT NULL OR nullif(btrim(r.text_value),'') IS NOT NULL)
     UNION ALL
     SELECT jsonb_build_object('week_start', date_trunc('week', e.feedback_date)::date,
       'source','external','author', e.stakeholder_name || coalesce(' ('||e.stakeholder_org||')',''),
       'tone', e.tone, 'channel', e.channel, 'text_value', e.content, 'date', e.feedback_date)
     FROM external_feedbacks e WHERE e.person_id=p_person_id AND e.feedback_date>=v_start
    ) t),'[]'::jsonb)
 );
END $$;
REVOKE ALL ON FUNCTION public.get_person_weekly_wellbeing(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_person_weekly_wellbeing(text,integer) TO authenticated;