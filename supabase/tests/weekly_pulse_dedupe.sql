-- Isolated fixture database only: seed supabase/tests/weekly_pulse_fixture.sql first.
BEGIN;
SET test.uid='00000000-0000-0000-0000-000000000001'; SET test.manager='true';
DO $$ DECLARE j jsonb; q uuid:='6a8e78a7-5fbf-4e2e-bff4-918109b05f5f'; r uuid:='00000000-0000-0000-0000-000000000011'; t numeric:=extract(epoch FROM '2026-09-10T10:00:00Z'::timestamptz); BEGIN
 ASSERT (SELECT count(*) FROM pulse_responses WHERE run_id=r)=3,'one scale per person plus comment';
 ASSERT (SELECT scale_value FROM pulse_responses WHERE run_id=r AND respondent_id='douglas' AND question_id=q)=4,'latest historical value';
 ASSERT (SELECT count(*) FROM engagement_points WHERE person_id='douglas')=1,'points reconciled';
 ASSERT (SELECT count(*) FROM pulse_run_recipients WHERE run_id=r)=2,'recipients merged';
 ASSERT (SELECT count(*) FROM pulse_weekly_repair_audit)=12,'full original snapshots';
 j:=submit_pulse_response('00000000-0000-0000-0000-000000000012',q,'douglas',t,'click-new',5);
 ASSERT j->>'action'='updated' AND j->>'notify'='false','alias updates, no new notification';
 j:=submit_pulse_response(r,q,'douglas',t-1,'click-old',1);
 ASSERT j->>'action'='repeated','out-of-order ignored';
 j:=submit_pulse_response(r,q,'douglas',t,'click-new',5);
 ASSERT j->>'action'='repeated','retry ignored';
 j:=submit_pulse_response(r,q,'douglas',t+1,'same-value',5);
 ASSERT j->>'action'='repeated','identical answer does not notify';
 ASSERT (SELECT submitted_at FROM pulse_responses WHERE run_id=r AND respondent_id='douglas' AND question_id=q)='2026-09-09T13:00:00Z'::timestamptz,'participation date preserved';
 ASSERT (SELECT text_value FROM pulse_responses WHERE run_id=r AND respondent_id='douglas' AND question_id='00000000-0000-0000-0000-000000000004')='preservado','note does not erase comment';
 j:=submit_pulse_response(r,'00000000-0000-0000-0000-000000000004','douglas',t+2,'text-new',NULL,'editado');
 ASSERT j->>'action'='updated','comment updated independently';
 -- Thursday click from checkout message must resolve to this week's regular checkin.
 j:=submit_pulse_response('00000000-0000-0000-0000-000000000013','d7937f3c-4cee-4c7b-bf7a-0b31ae2c1b08','douglas',t+3,'reclassified',3);
 ASSERT j->>'runId'=r::text AND j->>'action'='updated','reclassified and regular share cycle';
 ASSERT (SELECT count(*) FROM pulse_responses WHERE run_id=r)=3,'no duplicate after all updates';
 ASSERT (SELECT responses_count FROM pulse_runs WHERE id=r)=2,'participants not question rows';
 ASSERT (SELECT count(*) FROM engagement_points WHERE person_id='douglas')=1,'no extra points';
 j:=get_wellbeing_report(12);
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE x->>'scope'='total' AND x->>'level'='period' AND x->>'kind'='checkin' AND x->>'response_count'='2' AND x->>'status'='protected'),'report counts and privacy';
 -- Another week and checkout remain separate.
 ASSERT (ensure_weekly_pulse_run(q,'2026-08-31T03:00:00Z')).id<>r,'different week';
 ASSERT (ensure_weekly_pulse_run(q,'2026-09-07T02:59:59Z')).canonical_week='2026-08-31'::date,'Sunday SP boundary';
 ASSERT (ensure_weekly_pulse_run(q,'2026-09-07T03:00:00Z')).id=r,'Monday SP boundary';
 j:=submit_pulse_response('00000000-0000-0000-0000-000000000013','d7937f3c-4cee-4c7b-bf7a-0b31ae2c1b08','douglas',extract(epoch FROM '2026-09-04T15:00:00Z'::timestamptz),'checkout',4);
 ASSERT j->>'runId'<>r::text,'checkout remains separate';
 -- Independent peer subjects are never merged.
 j:=submit_pulse_response('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000003','douglas',t,'peer-1',4,NULL,'other');
 j:=submit_pulse_response('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000003','douglas',t,'peer-2',5,NULL,'third');
 ASSERT (SELECT count(*) FROM pulse_responses WHERE subject_id IS NOT NULL)=2,'peers independent';
 ASSERT NOT has_function_privilege('authenticated','submit_pulse_response(uuid,uuid,text,numeric,text,integer,text,text,text)','execute'),'clients cannot forge answers';
 ASSERT NOT has_table_privilege('authenticated','pulse_weekly_repair_audit','select'),'private snapshots';
END $$;
ROLLBACK;
