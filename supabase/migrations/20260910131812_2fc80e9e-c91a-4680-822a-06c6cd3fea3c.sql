ALTER TABLE public.pulse_runs ADD COLUMN canonical_week date, ADD COLUMN canonical_run_id uuid REFERENCES public.pulse_runs(id);
ALTER TABLE public.pulse_runs DROP CONSTRAINT IF EXISTS pulse_runs_status_check;
ALTER TABLE public.pulse_runs ADD CONSTRAINT pulse_runs_status_check CHECK(status IN ('pending','sent','partial','failed','deferred','superseded'));
CREATE UNIQUE INDEX pulse_runs_weekly_cycle ON public.pulse_runs(survey_id,canonical_week) WHERE canonical_run_id IS NULL;
ALTER TABLE public.pulse_responses ADD COLUMN updated_at timestamptz, ADD COLUMN last_event_at numeric, ADD COLUMN last_event_id text;

CREATE FUNCTION public.is_weekly_wellbeing(p_survey_id uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.pulse_surveys WHERE id=p_survey_id AND kind='self' AND frequency='weekly' AND title IN ('Check-in semanal de bem-estar','Check-out semanal'));
$$;

CREATE FUNCTION public.ensure_weekly_pulse_run(p_survey_id uuid,p_at timestamptz,p_recipients integer DEFAULT 0,p_deadline timestamptz DEFAULT NULL)
RETURNS public.pulse_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_week date; v_run public.pulse_runs;
BEGIN
 IF p_at IS NULL OR NOT public.is_weekly_wellbeing(p_survey_id) OR p_recipients<0 THEN RAISE EXCEPTION 'Invalid weekly cycle'; END IF;
 v_week:=date_trunc('week',p_at AT TIME ZONE 'America/Sao_Paulo')::date;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_survey_id::text||v_week::text,0));
 SELECT * INTO v_run FROM public.pulse_runs WHERE survey_id=p_survey_id AND canonical_run_id IS NULL
 AND date_trunc('week',dispatched_at AT TIME ZONE 'America/Sao_Paulo')::date=v_week
 ORDER BY (canonical_week IS NOT NULL) DESC,(error_message IS DISTINCT FROM 'RECLASSIFIED_WEEK') DESC,dispatched_at,id LIMIT 1 FOR UPDATE;
 IF v_run.id IS NULL THEN
  INSERT INTO public.pulse_runs(survey_id,dispatched_at,canonical_week,status,recipients_count,deadline_at)
  VALUES(p_survey_id,p_at,v_week,CASE WHEN p_recipients>0 THEN 'pending' ELSE 'sent' END,p_recipients,p_deadline) RETURNING * INTO v_run;
 ELSE
  UPDATE public.pulse_runs SET canonical_week=v_week,recipients_count=greatest(recipients_count,p_recipients),deadline_at=coalesce(deadline_at,p_deadline) WHERE id=v_run.id RETURNING * INTO v_run;
 END IF;
 RETURN v_run;
END $$;

CREATE FUNCTION public.resolve_pulse_response_target(p_run_id uuid,p_question_id uuid,p_event_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_run public.pulse_runs; v_survey public.pulse_surveys; v_question public.pulse_questions; v_target uuid; v_q uuid; v_expected text; v_dow int;
BEGIN
 SELECT * INTO STRICT v_run FROM public.pulse_runs WHERE id=p_run_id;
 SELECT * INTO STRICT v_question FROM public.pulse_questions WHERE id=p_question_id AND survey_id=v_run.survey_id;
 IF NOT public.is_weekly_wellbeing(v_run.survey_id) THEN RETURN jsonb_build_object('runId',p_run_id,'questionId',p_question_id); END IF;
 SELECT * INTO STRICT v_survey FROM public.pulse_surveys WHERE id=v_run.survey_id;
 v_dow:=extract(isodow FROM p_event_at AT TIME ZONE 'America/Sao_Paulo');
 v_expected:=CASE WHEN v_dow BETWEEN 1 AND 4 THEN 'Check-in semanal de bem-estar' ELSE 'Check-out semanal' END;
 IF v_survey.title=v_expected THEN
  v_run:=public.ensure_weekly_pulse_run(v_run.survey_id,v_run.dispatched_at);
  RETURN jsonb_build_object('runId',v_run.id,'questionId',p_question_id);
 END IF;
 SELECT id INTO STRICT v_target FROM public.pulse_surveys WHERE title=v_expected AND kind='self' AND frequency='weekly';
 PERFORM pg_advisory_xact_lock(hashtextextended(v_target::text||':question',0));
 BEGIN
  SELECT id INTO STRICT v_q FROM public.pulse_questions WHERE survey_id=v_target AND position=v_question.position AND question_type=v_question.question_type;
 EXCEPTION WHEN no_data_found THEN
  INSERT INTO public.pulse_questions(survey_id,position,question_type,question_text,required) VALUES(v_target,v_question.position,v_question.question_type,v_question.question_text,v_question.required) RETURNING id INTO v_q;
 END;
 v_run:=public.ensure_weekly_pulse_run(v_target,p_event_at);
 RETURN jsonb_build_object('runId',v_run.id,'questionId',v_q);
END $$;

CREATE FUNCTION public.submit_pulse_response(p_run_id uuid,p_question_id uuid,p_respondent_id text,p_event_at numeric,p_event_id text,p_scale integer DEFAULT NULL,p_text text DEFAULT NULL,p_subject_id text DEFAULT NULL,p_message_ts text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_target jsonb; v_run uuid; v_q uuid; v_old public.pulse_responses; v_id uuid; v_at timestamptz; v_action text; v_type text;
BEGIN
 IF p_event_at IS NULL OR p_event_at<=0 OR p_event_at>extract(epoch FROM now())+300 OR p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid event'; END IF;
 IF (p_scale IS NULL)=(p_text IS NULL) OR (p_scale IS NOT NULL AND p_scale NOT BETWEEN 1 AND 5) OR (p_text IS NOT NULL AND length(trim(p_text)) NOT BETWEEN 1 AND 3000) THEN RAISE EXCEPTION 'Invalid answer'; END IF;
 v_at:=to_timestamp(p_event_at::double precision);
 IF p_subject_id IS NULL THEN
  v_target:=public.resolve_pulse_response_target(p_run_id,p_question_id,v_at);
  v_run:=(v_target->>'runId')::uuid; v_q:=(v_target->>'questionId')::uuid;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.peer_review_pairs WHERE run_id=p_run_id AND reviewer_id=p_respondent_id AND subject_id=p_subject_id) THEN RAISE EXCEPTION 'Invalid peer pair'; END IF;
  v_run:=p_run_id; v_q:=p_question_id;
 END IF;
 PERFORM 1 FROM public.pulse_runs WHERE id=v_run FOR UPDATE;
 SELECT q.question_type INTO STRICT v_type FROM public.pulse_questions q JOIN public.pulse_runs r ON r.survey_id=q.survey_id WHERE r.id=v_run AND q.id=v_q;
 IF (v_type='scale_1_5' AND p_scale IS NULL) OR (v_type='open_text' AND p_text IS NULL) THEN RAISE EXCEPTION 'Invalid answer type'; END IF;
 SELECT * INTO v_old FROM public.pulse_responses WHERE run_id=v_run AND question_id=v_q AND respondent_id=p_respondent_id AND subject_id IS NOT DISTINCT FROM p_subject_id FOR UPDATE;
 IF v_old.id IS NOT NULL AND (v_old.last_event_id=p_event_id OR (p_event_at,p_event_id)<=(coalesce(v_old.last_event_at,extract(epoch FROM coalesce(v_old.updated_at,v_old.submitted_at))),coalesce(v_old.last_event_id,''))) THEN
  RETURN jsonb_build_object('id',v_old.id,'runId',v_run,'action','repeated','notify',false);
 END IF;
 IF v_old.id IS NULL THEN
  INSERT INTO public.pulse_responses(run_id,question_id,respondent_id,subject_id,scale_value,text_value,slack_message_ts,submitted_at,updated_at,last_event_at,last_event_id)
  VALUES(v_run,v_q,p_respondent_id,p_subject_id,p_scale,p_text,p_message_ts,v_at,v_at,p_event_at,p_event_id) RETURNING id INTO v_id;
  v_action:='inserted';
 ELSE
  v_id:=v_old.id;
  v_action:=CASE WHEN v_old.scale_value IS NOT DISTINCT FROM p_scale AND v_old.text_value IS NOT DISTINCT FROM p_text THEN 'repeated' ELSE 'updated' END;
  UPDATE public.pulse_responses SET scale_value=p_scale,text_value=p_text,slack_message_ts=coalesce(p_message_ts,slack_message_ts),updated_at=v_at,last_event_at=p_event_at,last_event_id=p_event_id WHERE id=v_id;
 END IF;
 UPDATE public.pulse_runs SET responses_count=(SELECT CASE WHEN public.is_weekly_wellbeing(survey_id) THEN count(DISTINCT respondent_id) ELSE count(*) END FROM public.pulse_responses WHERE run_id=v_run) WHERE id=v_run;
 IF p_subject_id IS NULL THEN
  UPDATE public.pulse_run_recipients SET responded_at=coalesce(responded_at,v_at) WHERE run_id=v_run AND person_id=p_respondent_id;
 END IF;
 PERFORM public.award_points(p_respondent_id,5,'pulse_response',v_run::text);
 RETURN jsonb_build_object('id',v_id,'runId',v_run,'action',v_action,'notify',v_action='inserted');
END $$;

-- Snapshot before repair: service-only audit, including deleted duplicates and points.
CREATE TABLE public.pulse_weekly_repair_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch text NOT NULL DEFAULT 'weekly-latest-wins-20260910',
 table_name text NOT NULL, row_id text NOT NULL, canonical_run_id uuid NOT NULL, previous_row jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(batch,table_name,row_id)
);
GRANT ALL ON public.pulse_weekly_repair_audit TO service_role;
REVOKE ALL ON public.pulse_weekly_repair_audit FROM PUBLIC,anon,authenticated;
ALTER TABLE public.pulse_weekly_repair_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_only ON public.pulse_weekly_repair_audit FOR ALL TO service_role USING(true) WITH CHECK(true);
LOCK TABLE public.pulse_runs, public.pulse_responses, public.pulse_run_recipients, public.engagement_points IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE weekly_run_map ON COMMIT DROP AS
 SELECT id, survey_id, date_trunc('week',dispatched_at AT TIME ZONE 'America/Sao_Paulo')::date wk,
 first_value(id) OVER (PARTITION BY survey_id,date_trunc('week',dispatched_at AT TIME ZONE 'America/Sao_Paulo') ORDER BY (error_message IS DISTINCT FROM 'RECLASSIFIED_WEEK') DESC,recipients_count DESC,dispatched_at,id) canonical
 FROM public.pulse_runs WHERE public.is_weekly_wellbeing(survey_id);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.peer_review_pairs p JOIN weekly_run_map m ON m.id=p.run_id) OR EXISTS(SELECT 1 FROM public.pulse_responses r JOIN weekly_run_map m ON m.id=r.run_id WHERE r.subject_id IS NOT NULL) THEN RAISE EXCEPTION 'Unexpected peer data in weekly wellbeing'; END IF;
END $$;
INSERT INTO public.pulse_weekly_repair_audit(table_name,row_id,canonical_run_id,previous_row)
 SELECT 'pulse_runs',r.id::text,m.canonical,to_jsonb(r) FROM public.pulse_runs r JOIN weekly_run_map m USING(id)
 UNION ALL SELECT 'pulse_responses',r.id::text,m.canonical,to_jsonb(r) FROM public.pulse_responses r JOIN weekly_run_map m ON m.id=r.run_id
 UNION ALL SELECT 'pulse_run_recipients',r.id::text,m.canonical,to_jsonb(r) FROM public.pulse_run_recipients r JOIN weekly_run_map m ON m.id=r.run_id
 UNION ALL SELECT 'engagement_points',r.id::text,m.canonical,to_jsonb(r) FROM public.engagement_points r JOIN weekly_run_map m ON m.id::text=r.source_id WHERE r.reason='pulse_response';
CREATE TEMP TABLE weekly_response_winners ON COMMIT DROP AS
 SELECT r.id,m.canonical,min(r.submitted_at) OVER w first_at,
 row_number() OVER (PARTITION BY m.canonical,r.question_id,r.respondent_id,r.subject_id ORDER BY coalesce(r.updated_at,r.submitted_at) DESC,r.id DESC) rank
 FROM public.pulse_responses r JOIN weekly_run_map m ON m.id=r.run_id
 WINDOW w AS (PARTITION BY m.canonical,r.question_id,r.respondent_id,r.subject_id);
DELETE FROM public.pulse_responses r USING weekly_response_winners w WHERE r.id=w.id AND w.rank>1;
UPDATE public.pulse_responses r SET run_id=w.canonical,updated_at=coalesce(r.updated_at,r.submitted_at),last_event_at=extract(epoch FROM coalesce(r.updated_at,r.submitted_at)),submitted_at=w.first_at
 FROM weekly_response_winners w WHERE r.id=w.id AND w.rank=1;
CREATE TEMP TABLE weekly_recipient_winners ON COMMIT DROP AS
 SELECT r.id,m.canonical,min(sent_at) OVER w first_sent,min(responded_at) OVER w first_response,max(reminders_sent_count) OVER w reminders,
 row_number() OVER(PARTITION BY m.canonical,r.person_id ORDER BY sent_at DESC,r.id DESC) rank
 FROM public.pulse_run_recipients r JOIN weekly_run_map m ON m.id=r.run_id WINDOW w AS (PARTITION BY m.canonical,r.person_id);
DELETE FROM public.pulse_run_recipients r USING weekly_recipient_winners w WHERE r.id=w.id AND w.rank>1;
UPDATE public.pulse_run_recipients r SET run_id=w.canonical,sent_at=w.first_sent,responded_at=coalesce(w.first_response,(SELECT min(submitted_at) FROM public.pulse_responses x WHERE x.run_id=w.canonical AND x.respondent_id=r.person_id)),reminders_sent_count=w.reminders
 FROM weekly_recipient_winners w WHERE r.id=w.id AND w.rank=1;
CREATE TEMP TABLE weekly_point_winners ON COMMIT DROP AS
 SELECT p.id,m.canonical,row_number() OVER(PARTITION BY m.canonical,p.person_id,p.reason ORDER BY p.created_at,p.id) rank
 FROM public.engagement_points p JOIN weekly_run_map m ON m.id::text=p.source_id WHERE p.reason='pulse_response';
DELETE FROM public.engagement_points p USING weekly_point_winners w WHERE p.id=w.id AND w.rank>1;
UPDATE public.engagement_points p SET source_id=w.canonical::text FROM weekly_point_winners w WHERE p.id=w.id AND w.rank=1;
-- Aliases remain so buttons in old Slack messages still resolve safely.
UPDATE public.pulse_runs r SET canonical_run_id=m.canonical,canonical_week=NULL,status='superseded',recipients_count=0,responses_count=0,deadline_at=NULL FROM weekly_run_map m WHERE r.id=m.id AND m.id<>m.canonical;
UPDATE public.pulse_runs r SET canonical_week=m.wk,
 recipients_count=greatest(
  (SELECT max((a.previous_row->>'recipients_count')::int) FROM public.pulse_weekly_repair_audit a WHERE a.table_name='pulse_runs' AND a.canonical_run_id=r.id),
  (SELECT count(*) FROM (SELECT person_id FROM public.pulse_run_recipients WHERE run_id=r.id UNION SELECT respondent_id FROM public.pulse_responses WHERE run_id=r.id) persons)),
 responses_count=(SELECT count(DISTINCT respondent_id) FROM public.pulse_responses WHERE run_id=r.id)
 FROM weekly_run_map m WHERE r.id=m.id AND m.id=m.canonical;

CREATE FUNCTION public.guard_weekly_pulse_run() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.canonical_run_id IS NULL AND public.is_weekly_wellbeing(NEW.survey_id) THEN NEW.canonical_week:=date_trunc('week',NEW.dispatched_at AT TIME ZONE 'America/Sao_Paulo')::date; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_weekly_pulse_run BEFORE INSERT ON public.pulse_runs FOR EACH ROW EXECUTE FUNCTION public.guard_weekly_pulse_run();
CREATE FUNCTION public.route_canonical_pulse_response() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 SELECT canonical_run_id INTO v_id FROM public.pulse_runs WHERE id=NEW.run_id;
 IF v_id IS NOT NULL THEN NEW.run_id:=v_id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_route_canonical_pulse_response BEFORE INSERT OR UPDATE OF run_id ON public.pulse_responses FOR EACH ROW EXECUTE FUNCTION public.route_canonical_pulse_response();
REVOKE ALL ON FUNCTION public.is_weekly_wellbeing(uuid),public.ensure_weekly_pulse_run(uuid,timestamptz,integer,timestamptz),public.resolve_pulse_response_target(uuid,uuid,timestamptz),public.submit_pulse_response(uuid,uuid,text,numeric,text,integer,text,text,text),public.guard_weekly_pulse_run(),public.route_canonical_pulse_response() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_weekly_wellbeing(uuid),public.ensure_weekly_pulse_run(uuid,timestamptz,integer,timestamptz),public.resolve_pulse_response_target(uuid,uuid,timestamptz),public.submit_pulse_response(uuid,uuid,text,numeric,text,integer,text,text,text),public.guard_weekly_pulse_run(),public.route_canonical_pulse_response() TO service_role;
-- Bind the trend to the original cycle, not the time an answer was edited.
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.get_wellbeing_report(integer,text)'::regprocedure) INTO d;
 IF strpos(d,'r.submitted_at>=v_from')=0 OR strpos(d,'rr.sent_at>=v_from')=0 THEN RAISE EXCEPTION 'Unexpected wellbeing definition'; END IF;
 d:=replace(d,$q$date_trunc('week',r.submitted_at AT TIME ZONE 'America/Sao_Paulo')::date AS wk$q$,$q$coalesce(run.canonical_week,date_trunc('week',r.submitted_at AT TIME ZONE 'America/Sao_Paulo')::date) AS wk$q$);
 d:=replace(d,'r.submitted_at>=v_from AND r.submitted_at<=now()',$q$coalesce(run.canonical_week::timestamp AT TIME ZONE 'America/Sao_Paulo',r.submitted_at)>=v_from AND r.submitted_at<=now()$q$);
 d:=replace(d,$q$date_trunc('week',rr.sent_at AT TIME ZONE 'America/Sao_Paulo')::date AS wk$q$,$q$coalesce(run.canonical_week,date_trunc('week',rr.sent_at AT TIME ZONE 'America/Sao_Paulo')::date) AS wk$q$);
 d:=replace(d,'r.submitted_at>=rr.sent_at AND r.submitted_at<=now()','r.submitted_at<=now()');
 d:=replace(d,'rr.sent_at>=v_from AND rr.sent_at<=now()',$q$coalesce(run.canonical_week::timestamp AT TIME ZONE 'America/Sao_Paulo',rr.sent_at)>=v_from AND rr.sent_at<=now()$q$);
 EXECUTE d;
END $$;
ALTER TABLE public.pulse_runs ADD COLUMN dispatch_lease_until timestamptz, ADD COLUMN dispatch_lease_token uuid;
CREATE FUNCTION public.claim_weekly_pulse_dispatch(p_run_id uuid,p_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.pulse_runs SET dispatch_lease_until=now()+interval '10 minutes',dispatch_lease_token=p_token
 WHERE id=p_run_id AND canonical_run_id IS NULL AND canonical_week IS NOT NULL AND (dispatch_lease_until IS NULL OR dispatch_lease_until<now());
 RETURN FOUND;
END $$;
CREATE FUNCTION public.finish_weekly_pulse_dispatch(p_run_id uuid,p_token uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count int;
BEGIN
 PERFORM 1 FROM public.pulse_runs WHERE id=p_run_id AND dispatch_lease_token=p_token FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 UPDATE public.pulse_run_recipients rr SET responded_at=(SELECT min(submitted_at) FROM public.pulse_responses r WHERE r.run_id=rr.run_id AND r.respondent_id=rr.person_id)
 WHERE rr.run_id=p_run_id AND rr.responded_at IS NULL;
 SELECT count(*) INTO v_count FROM public.pulse_run_recipients WHERE run_id=p_run_id;
 UPDATE public.pulse_runs SET dispatch_lease_until=NULL,dispatch_lease_token=NULL,recipients_count=greatest(recipients_count,v_count),
 status=CASE WHEN v_count>=recipients_count AND v_count>0 THEN 'sent' WHEN v_count>0 THEN 'partial' ELSE status END
 WHERE id=p_run_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_weekly_pulse_dispatch(uuid,uuid),public.finish_weekly_pulse_dispatch(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_weekly_pulse_dispatch(uuid,uuid),public.finish_weekly_pulse_dispatch(uuid,uuid) TO service_role;
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.get_pulse_weekly_trend(uuid,integer,text,uuid)'::regprocedure) INTO d;
 IF strpos(d,'resp.submitted_at AT TIME ZONE')=0 THEN RAISE EXCEPTION 'Unexpected weekly trend'; END IF;
 d:=replace(d,$q$date_trunc('week', resp.submitted_at AT TIME ZONE 'America/Sao_Paulo')::date$q$,$q$coalesce(r.canonical_week,date_trunc('week', resp.submitted_at AT TIME ZONE 'America/Sao_Paulo')::date)$q$);
 d:=replace(d,'AND resp.submitted_at >=',$q$AND coalesce(r.canonical_week::timestamp AT TIME ZONE 'America/Sao_Paulo',resp.submitted_at) >=$q$);
 EXECUTE d;
END $$;