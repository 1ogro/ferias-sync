
-- Add 'kudos' to pulse_kind enum
ALTER TYPE public.pulse_kind ADD VALUE IF NOT EXISTS 'kudos';

-- Add kudos-specific configuration columns to pulse_surveys
ALTER TABLE public.pulse_surveys
  ADD COLUMN IF NOT EXISTS kudos_categories public.kudos_category[] NULL,
  ADD COLUMN IF NOT EXISTS kudos_channel text NULL,
  ADD COLUMN IF NOT EXISTS prompt_text text NULL;
