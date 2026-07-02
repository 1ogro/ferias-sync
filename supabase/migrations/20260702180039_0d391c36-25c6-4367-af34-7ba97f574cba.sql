
ALTER TABLE public.pulse_surveys
  ADD COLUMN IF NOT EXISTS peer_pairing_strategy text NOT NULL DEFAULT 'round_robin',
  ADD COLUMN IF NOT EXISTS peer_fixed_pairs jsonb;

ALTER TABLE public.pulse_surveys
  DROP CONSTRAINT IF EXISTS pulse_surveys_peer_pairing_strategy_check;

ALTER TABLE public.pulse_surveys
  ADD CONSTRAINT pulse_surveys_peer_pairing_strategy_check
  CHECK (peer_pairing_strategy IN ('round_robin', 'random', 'fixed'));
