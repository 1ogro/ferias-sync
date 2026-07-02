-- Integridade do valor de K persistido na execução
ALTER TABLE public.pulse_runs
  DROP CONSTRAINT IF EXISTS pulse_runs_peer_reviews_per_reviewer_range;
ALTER TABLE public.pulse_runs
  ADD CONSTRAINT pulse_runs_peer_reviews_per_reviewer_range
  CHECK (peer_reviews_per_reviewer IS NULL OR (peer_reviews_per_reviewer BETWEEN 1 AND 5));

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_pulse_runs_survey
  ON public.pulse_runs (survey_id);

CREATE INDEX IF NOT EXISTS idx_peer_pairs_subject
  ON public.peer_review_pairs (subject_id);

CREATE INDEX IF NOT EXISTS idx_pulse_responses_run_subject
  ON public.pulse_responses (run_id, subject_id);

CREATE INDEX IF NOT EXISTS idx_pulse_responses_respondent
  ON public.pulse_responses (respondent_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entidade
  ON public.audit_logs (entidade, entidade_id, created_at DESC);