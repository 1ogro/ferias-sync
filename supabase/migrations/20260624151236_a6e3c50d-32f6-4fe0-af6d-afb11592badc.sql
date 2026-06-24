
CREATE OR REPLACE FUNCTION public.is_admin_or_director()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles pr
    JOIN people p ON p.id = pr.person_id
    WHERE pr.user_id = auth.uid()
      AND (p.is_admin = true OR p.papel IN ('DIRETOR','ADMIN'))
  );
$$;

CREATE OR REPLACE FUNCTION public.current_person_id()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT person_id FROM profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE TABLE public.pulse_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by text NOT NULL REFERENCES public.people(id),
  title text NOT NULL,
  description text,
  anonymous boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'once' CHECK (frequency IN ('once','daily','weekly','biweekly','monthly')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  target_scope text NOT NULL DEFAULT 'team' CHECK (target_scope IN ('team','custom')),
  target_team_id text,
  target_person_ids text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pulse_surveys TO authenticated;
GRANT ALL ON public.pulse_surveys TO service_role;

ALTER TABLE public.pulse_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pulse_surveys_select_admin" ON public.pulse_surveys
  FOR SELECT TO authenticated USING (public.is_admin_or_director());
CREATE POLICY "pulse_surveys_select_owner" ON public.pulse_surveys
  FOR SELECT TO authenticated USING (created_by = public.current_person_id());
CREATE POLICY "pulse_surveys_insert" ON public.pulse_surveys
  FOR INSERT TO authenticated WITH CHECK (
    created_by = public.current_person_id()
    AND EXISTS (SELECT 1 FROM people p WHERE p.id = public.current_person_id()
                AND (p.is_admin = true OR p.papel IN ('DIRETOR','ADMIN','GESTOR')))
  );
CREATE POLICY "pulse_surveys_update" ON public.pulse_surveys
  FOR UPDATE TO authenticated USING (created_by = public.current_person_id() OR public.is_admin_or_director());
CREATE POLICY "pulse_surveys_delete" ON public.pulse_surveys
  FOR DELETE TO authenticated USING (created_by = public.current_person_id() OR public.is_admin_or_director());

CREATE TABLE public.pulse_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.pulse_surveys(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  question_text text NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('scale_1_5','open_text')),
  required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pulse_questions TO authenticated;
GRANT ALL ON public.pulse_questions TO service_role;
ALTER TABLE public.pulse_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pulse_questions_select" ON public.pulse_questions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.pulse_surveys s WHERE s.id = survey_id
            AND (public.is_admin_or_director() OR s.created_by = public.current_person_id()))
  );
CREATE POLICY "pulse_questions_all" ON public.pulse_questions
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.pulse_surveys s WHERE s.id = survey_id
            AND (s.created_by = public.current_person_id() OR public.is_admin_or_director()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.pulse_surveys s WHERE s.id = survey_id
            AND (s.created_by = public.current_person_id() OR public.is_admin_or_director()))
  );

CREATE TABLE public.pulse_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.pulse_surveys(id) ON DELETE CASCADE,
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','partial','failed')),
  recipients_count int NOT NULL DEFAULT 0,
  responses_count int NOT NULL DEFAULT 0,
  error_message text
);

GRANT SELECT ON public.pulse_runs TO authenticated;
GRANT ALL ON public.pulse_runs TO service_role;
ALTER TABLE public.pulse_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pulse_runs_select" ON public.pulse_runs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.pulse_surveys s WHERE s.id = survey_id
            AND (public.is_admin_or_director() OR s.created_by = public.current_person_id()))
  );

CREATE TABLE public.pulse_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pulse_runs(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.pulse_questions(id) ON DELETE CASCADE,
  respondent_id text NOT NULL REFERENCES public.people(id),
  scale_value int CHECK (scale_value BETWEEN 1 AND 5),
  text_value text,
  slack_message_ts text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, question_id, respondent_id)
);

GRANT SELECT ON public.pulse_responses TO authenticated;
GRANT ALL ON public.pulse_responses TO service_role;
ALTER TABLE public.pulse_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pulse_responses_select" ON public.pulse_responses
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.pulse_runs r
      JOIN public.pulse_surveys s ON s.id = r.survey_id
      WHERE r.id = run_id
        AND s.anonymous = false
        AND (public.is_admin_or_director() OR s.created_by = public.current_person_id())
    )
  );

CREATE OR REPLACE VIEW public.pulse_responses_safe
WITH (security_invoker = true)
AS
SELECT
  resp.id,
  resp.run_id,
  resp.question_id,
  CASE WHEN s.anonymous THEN NULL ELSE resp.respondent_id END AS respondent_id,
  CASE WHEN s.anonymous THEN 'R' || dense_rank() OVER (PARTITION BY r.survey_id ORDER BY resp.respondent_id)
       ELSE NULL END AS anonymous_label,
  resp.scale_value,
  resp.text_value,
  resp.submitted_at,
  r.survey_id
FROM public.pulse_responses resp
JOIN public.pulse_runs r ON r.id = resp.run_id
JOIN public.pulse_surveys s ON s.id = r.survey_id
WHERE public.is_admin_or_director() OR s.created_by = public.current_person_id();

GRANT SELECT ON public.pulse_responses_safe TO authenticated;

CREATE TRIGGER trg_pulse_surveys_updated_at
BEFORE UPDATE ON public.pulse_surveys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
