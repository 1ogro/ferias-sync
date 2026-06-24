
ALTER TABLE public.pulse_surveys
  ADD COLUMN IF NOT EXISTS notify_manager_on_negative boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_manager_on_positive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_negative_threshold integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS notify_positive_threshold integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS notify_include_text_responses boolean NOT NULL DEFAULT false;
