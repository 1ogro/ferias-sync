ALTER TABLE public.pulse_runs
  ADD COLUMN IF NOT EXISTS peer_reviews_per_reviewer integer,
  ADD COLUMN IF NOT EXISTS peer_pairing_strategy text;