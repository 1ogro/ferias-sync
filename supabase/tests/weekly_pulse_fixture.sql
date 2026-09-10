INSERT INTO people VALUES ('douglas'),('other'),('third');
INSERT INTO pulse_surveys(id,title,kind,frequency) VALUES
 ('6a8e78a7-5fbf-4e2e-bff4-918109b05f5f','Check-in semanal de bem-estar','self','weekly'),
 ('d7937f3c-4cee-4c7b-bf7a-0b31ae2c1b08','Check-out semanal','self','weekly'),
 ('00000000-0000-0000-0000-000000000003','Peers','peer','weekly');
INSERT INTO pulse_questions(id,survey_id,position,question_type,question_text) SELECT id,id,0,'scale_1_5','Nota?' FROM pulse_surveys;
INSERT INTO pulse_questions(id,survey_id,position,question_type,question_text) VALUES('00000000-0000-0000-0000-000000000004','6a8e78a7-5fbf-4e2e-bff4-918109b05f5f',1,'open_text','Comentário?');
INSERT INTO pulse_runs(id,survey_id,dispatched_at,status,recipients_count,error_message) VALUES
 ('00000000-0000-0000-0000-000000000011','6a8e78a7-5fbf-4e2e-bff4-918109b05f5f','2026-09-07T13:00:00Z','sent',3,null),
 ('00000000-0000-0000-0000-000000000012','6a8e78a7-5fbf-4e2e-bff4-918109b05f5f','2026-09-07T03:00:00Z','sent',0,'RECLASSIFIED_WEEK'),
 ('00000000-0000-0000-0000-000000000013','d7937f3c-4cee-4c7b-bf7a-0b31ae2c1b08','2026-09-04T13:00:00Z','sent',3,null),
 ('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000003','2026-09-07T13:00:00Z','sent',3,null);
INSERT INTO pulse_responses(run_id,question_id,respondent_id,scale_value,submitted_at) VALUES
 ('00000000-0000-0000-0000-000000000011','6a8e78a7-5fbf-4e2e-bff4-918109b05f5f','douglas',2,'2026-09-09T13:00:00Z'),
 ('00000000-0000-0000-0000-000000000012','6a8e78a7-5fbf-4e2e-bff4-918109b05f5f','douglas',4,'2026-09-09T13:00:01Z'),
 ('00000000-0000-0000-0000-000000000012','6a8e78a7-5fbf-4e2e-bff4-918109b05f5f','other',5,'2026-09-09T13:00:02Z');
INSERT INTO pulse_responses(run_id,question_id,respondent_id,text_value,submitted_at) VALUES ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000004','douglas','preservado','2026-09-09T13:00:02Z');
INSERT INTO pulse_run_recipients(run_id,person_id,sent_at) VALUES
 ('00000000-0000-0000-0000-000000000011','douglas','2026-09-07T13:00:00Z'),
 ('00000000-0000-0000-0000-000000000012','douglas','2026-09-09T13:00:00Z'),
 ('00000000-0000-0000-0000-000000000012','other','2026-09-09T13:00:00Z');
INSERT INTO engagement_points(person_id,reason,points,source_id) VALUES
 ('douglas','pulse_response',5,'00000000-0000-0000-0000-000000000011'),('douglas','pulse_response',5,'00000000-0000-0000-0000-000000000012');
INSERT INTO peer_review_pairs(run_id,reviewer_id,subject_id) VALUES ('00000000-0000-0000-0000-000000000014','douglas','other'),('00000000-0000-0000-0000-000000000014','douglas','third');
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION is_manager_level() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.manager',true),'false')::boolean $$;
ALTER TABLE people ADD COLUMN sub_time text DEFAULT 'A', ADD COLUMN papel text DEFAULT 'COLABORADOR';
CREATE TABLE profiles(user_id uuid,person_id text);
