
DO $mig$
DECLARE
  checkin_sid uuid := (SELECT id FROM public.pulse_surveys WHERE title='Check-in semanal de bem-estar' LIMIT 1);
  checkout_sid uuid := (SELECT id FROM public.pulse_surveys WHERE title='Check-out semanal' LIMIT 1);
  r RECORD;
  expected_sid uuid;
  target_run uuid;
  target_qid uuid;
  week_anchor timestamptz;
  collision_id uuid;
  collision_ts timestamptz;
  affected uuid[] := ARRAY[]::uuid[];
BEGIN
  IF checkin_sid IS NULL OR checkout_sid IS NULL THEN
    RAISE NOTICE 'Surveys not found, skipping'; RETURN;
  END IF;

  FOR r IN
    SELECT resp.id, resp.run_id, resp.question_id, resp.respondent_id, resp.subject_id, resp.submitted_at,
           run.survey_id AS current_sid,
           q.position AS qpos, q.question_type AS qtype,
           EXTRACT(dow  FROM (resp.submitted_at AT TIME ZONE 'America/Sao_Paulo'))::int AS dow,
           date_trunc('week', (resp.submitted_at AT TIME ZONE 'America/Sao_Paulo')) AS week_start_local
    FROM public.pulse_responses resp
    JOIN public.pulse_runs run ON run.id = resp.run_id
    JOIN public.pulse_questions q ON q.id = resp.question_id
    WHERE run.survey_id IN (checkin_sid, checkout_sid)
  LOOP
    expected_sid := CASE WHEN r.dow BETWEEN 1 AND 4 THEN checkin_sid ELSE checkout_sid END;
    IF expected_sid = r.current_sid THEN CONTINUE; END IF;

    week_anchor := (r.week_start_local AT TIME ZONE 'America/Sao_Paulo');

    SELECT id INTO target_run
    FROM public.pulse_runs
    WHERE survey_id = expected_sid
      AND error_message = 'RECLASSIFIED_WEEK'
      AND dispatched_at = week_anchor
    LIMIT 1;

    IF target_run IS NULL THEN
      INSERT INTO public.pulse_runs (survey_id, status, dispatched_at, recipients_count, responses_count, error_message)
      VALUES (expected_sid, 'sent', week_anchor, 0, 0, 'RECLASSIFIED_WEEK')
      RETURNING id INTO target_run;
    END IF;

    SELECT id INTO target_qid
    FROM public.pulse_questions
    WHERE survey_id = expected_sid AND position = r.qpos AND question_type = r.qtype
    ORDER BY position LIMIT 1;

    IF target_qid IS NULL THEN
      INSERT INTO public.pulse_questions (survey_id, position, question_text, question_type, required, kind)
      SELECT expected_sid, r.qpos, q.question_text, r.qtype, q.required, q.kind
      FROM public.pulse_questions q WHERE q.id = r.question_id
      RETURNING id INTO target_qid;
    END IF;

    SELECT id, submitted_at INTO collision_id, collision_ts
    FROM public.pulse_responses
    WHERE run_id = target_run
      AND question_id = target_qid
      AND respondent_id IS NOT DISTINCT FROM r.respondent_id
      AND subject_id IS NOT DISTINCT FROM r.subject_id
    LIMIT 1;

    IF collision_id IS NOT NULL AND collision_id <> r.id THEN
      IF collision_ts >= r.submitted_at THEN
        DELETE FROM public.pulse_responses WHERE id = r.id;
      ELSE
        DELETE FROM public.pulse_responses WHERE id = collision_id;
        UPDATE public.pulse_responses SET run_id = target_run, question_id = target_qid WHERE id = r.id;
      END IF;
    ELSE
      UPDATE public.pulse_responses SET run_id = target_run, question_id = target_qid WHERE id = r.id;
    END IF;

    affected := array_append(affected, r.run_id);
    affected := array_append(affected, target_run);
  END LOOP;

  IF array_length(affected, 1) IS NOT NULL THEN
    UPDATE public.pulse_runs pr
       SET responses_count = COALESCE((SELECT count(*) FROM public.pulse_responses WHERE run_id = pr.id), 0)
     WHERE pr.id = ANY(SELECT DISTINCT unnest(affected));
  END IF;
END$mig$;
