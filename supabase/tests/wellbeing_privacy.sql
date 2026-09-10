-- Run only against the isolated fixture database, after installing get_wellbeing_report.
-- Current requirement: all aggregates with notes are visible, including small groups.
-- No production data changes: all fixture updates roll back.
BEGIN;
SET test.uid='00000000-0000-0000-0000-000000000001';
SET test.manager='true';
DELETE FROM pulse_responses;
DELETE FROM pulse_run_recipients;
DELETE FROM people;
INSERT INTO people SELECT team||i,team,'COLABORADOR' FROM unnest(ARRAY['A','B','C','D']) team CROSS JOIN generate_series(1,6) i;
-- A: large current week, sparse previous week. B: repeated notes from one person.
-- C/D: mixed types, combined group large but checkout small.
INSERT INTO pulse_responses(run_id,question_id,respondent_id,scale_value,submitted_at)
SELECT s.id,s.id,'A'||i,3,now()-interval '1 hour' FROM pulse_surveys s CROSS JOIN generate_series(1,4) i;
INSERT INTO pulse_responses(run_id,question_id,respondent_id,scale_value,submitted_at)
SELECT s.id,s.id,'A1',2,now()-interval '1 week' FROM pulse_surveys s;
INSERT INTO pulse_responses(run_id,question_id,respondent_id,scale_value,submitted_at)
SELECT s.id,s.id,'B1',4,now()-interval '1 hour' FROM pulse_surveys s CROSS JOIN generate_series(1,5);
INSERT INTO pulse_responses(run_id,question_id,respondent_id,scale_value,submitted_at)
SELECT s.id,s.id,team||i,3,now()-interval '1 hour' FROM pulse_surveys s CROSS JOIN unnest(ARRAY['C','D']) team CROSS JOIN generate_series(1,4) i
WHERE s.id='6a8e78a7-5fbf-4e2e-bff4-918109b05f5f' OR i=1;
DO $$ DECLARE j jsonb; filtered jsonb; other jsonb; r jsonb; w int;
BEGIN
 j:=get_wellbeing_report(4);
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE x->>'sub_time'='A' AND x->>'level'='week' AND x->>'kind'='checkin' AND x->>'status'='available'), 'healthy week recovered';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE x->>'sub_time'='B' AND x->>'avg_value'='4.00' AND (x->>'respondent_count')::int=1), 'one-person aggregate is visible without inflating participant count';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE x->>'sub_time'='C' AND x->>'kind'='both' AND x->>'status'='available'), 'combined team safe';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE x->>'sub_time'='C' AND x->>'kind'='checkout' AND x->>'avg_value' IS NOT NULL), 'small checkout is visible';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE x->>'sub_time'='A' AND x->>'level'='period' AND (x->>'avg_value')::numeric=2.80), 'period average includes sparse weeks';
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE (x->>'response_count')::int>0 AND (x->>'avg_value' IS NULL OR x->>'status'<>'available')), 'every nonempty aggregate is visible';
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE (x->>'response_count')::int=0 AND (x->>'avg_value' IS NOT NULL OR x->>'status'<>'empty')), 'no notes stays empty, not zero';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE x->>'status'='empty'), 'empty cells kept';
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE (x->>'status'='protected')<>(x->>'protection_reason' IS NOT NULL)), 'reason always present only for protected cells';
 ASSERT (SELECT sum((x->>'response_count')::int) FROM jsonb_array_elements(j->'rows') x WHERE x->>'level'='period' AND x->>'scope'='team' AND x->>'kind'='both')=(SELECT count(*) FROM pulse_responses), 'notes unchanged';
 filtered:=get_wellbeing_report(4,'A');
 ASSERT filtered->'teams'=j->'teams','team options stable';
 ASSERT (SELECT jsonb_agg(x ORDER BY x::text) FROM jsonb_array_elements(filtered->'rows') x)=(SELECT jsonb_agg(x ORDER BY x::text) FROM jsonb_array_elements(j->'rows') x WHERE x->>'sub_time'='A'),'filter does not change protection';
 FOREACH w IN ARRAY ARRAY[1,2,8,12,26,104] LOOP
  other:=get_wellbeing_report(w);
  ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') a JOIN jsonb_array_elements(other->'rows') b ON a->>'week_start'=b->>'week_start' AND a->>'scope'=b->>'scope' AND a->>'sub_time' IS NOT DISTINCT FROM b->>'sub_time' AND a->>'kind'=b->>'kind' WHERE a<>b),'overlapping weekly results are stable';
 END LOOP;
END $$;
-- Add two other small teams, making the residual block large enough for global both.
INSERT INTO people VALUES ('E1','E','COLABORADOR'),('F1','F','COLABORADOR');
INSERT INTO pulse_responses(run_id,question_id,respondent_id,scale_value,submitted_at)
SELECT s.id,s.id,p,4,now()-interval '1 hour' FROM pulse_surveys s CROSS JOIN unnest(ARRAY['E1','F1']) p;
DO $$ DECLARE j jsonb; BEGIN
 j:=get_wellbeing_report(4);
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE x->>'scope'='total' AND x->>'kind'='both' AND x->>'level'='week' AND x->>'status'='available'),'global combined recoverable';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE x->>'scope'='total' AND x->>'kind'='checkout' AND x->>'avg_value' IS NOT NULL),'checkout totals visible';
 ASSERT NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE (x->>'response_count')::int>0 AND x->>'avg_value' IS NULL),'small teams visible';
END $$;
SET test.uid='';
DO $$ BEGIN PERFORM get_wellbeing_report(4); RAISE EXCEPTION 'anonymous allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Not authenticated' THEN RAISE; END IF; END $$;
SET test.uid='00000000-0000-0000-0000-000000000001'; SET test.manager='false';
DO $$ BEGIN PERFORM get_wellbeing_report(4); RAISE EXCEPTION 'non-manager allowed'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Not authorized' THEN RAISE; END IF; END $$;
ROLLBACK;
