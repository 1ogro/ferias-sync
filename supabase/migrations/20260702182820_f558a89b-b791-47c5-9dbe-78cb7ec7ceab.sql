
ALTER TABLE public.pulse_surveys
  ADD COLUMN IF NOT EXISTS peer_reviews_per_reviewer integer NOT NULL DEFAULT 1;

ALTER TABLE public.pulse_surveys
  DROP CONSTRAINT IF EXISTS pulse_surveys_peer_reviews_per_reviewer_check;
ALTER TABLE public.pulse_surveys
  ADD CONSTRAINT pulse_surveys_peer_reviews_per_reviewer_check
  CHECK (peer_reviews_per_reviewer BETWEEN 1 AND 5);

ALTER TABLE public.peer_review_pairs
  ADD COLUMN IF NOT EXISTS slack_channel text,
  ADD COLUMN IF NOT EXISTS slack_message_ts text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminders_sent_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_peer_pairs_unique
  ON public.peer_review_pairs(run_id, reviewer_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_peer_pairs_run_completed
  ON public.peer_review_pairs(run_id, completed_at);

ALTER TABLE public.pulse_run_recipients
  ADD COLUMN IF NOT EXISTS pairs_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pairs_completed integer NOT NULL DEFAULT 0;

ALTER TABLE public.pulse_responses
  ADD COLUMN IF NOT EXISTS subject_id text REFERENCES public.people(id) ON DELETE SET NULL;

ALTER TABLE public.pulse_responses
  DROP CONSTRAINT IF EXISTS pulse_responses_run_id_question_id_respondent_id_key CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS pulse_responses_unique_response
  ON public.pulse_responses (run_id, question_id, respondent_id, subject_id) NULLS NOT DISTINCT;
