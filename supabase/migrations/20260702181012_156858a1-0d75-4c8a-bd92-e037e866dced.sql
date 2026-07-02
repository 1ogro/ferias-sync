
ALTER TABLE public.pulse_surveys
  ADD COLUMN IF NOT EXISTS response_deadline_hours integer,
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_offsets_hours integer[] NOT NULL DEFAULT ARRAY[24,2]::integer[];

ALTER TABLE public.pulse_runs
  ADD COLUMN IF NOT EXISTS deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminders_sent_at timestamptz[] NOT NULL DEFAULT ARRAY[]::timestamptz[];

CREATE TABLE IF NOT EXISTS public.pulse_run_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.pulse_runs(id) ON DELETE CASCADE,
  person_id text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  slack_user_id text,
  slack_channel text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  reminders_sent_count integer NOT NULL DEFAULT 0,
  UNIQUE (run_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_pulse_run_recipients_run ON public.pulse_run_recipients(run_id, responded_at);
CREATE INDEX IF NOT EXISTS idx_pulse_run_recipients_person ON public.pulse_run_recipients(person_id);

GRANT SELECT ON public.pulse_run_recipients TO authenticated;
GRANT ALL ON public.pulse_run_recipients TO service_role;

ALTER TABLE public.pulse_run_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pulse_run_recipients_select"
  ON public.pulse_run_recipients FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.pulse_runs r
      JOIN public.pulse_surveys s ON s.id = r.survey_id
      WHERE r.id = pulse_run_recipients.run_id
        AND (public.is_admin_or_director() OR s.created_by = public.current_person_id())
    )
  );
