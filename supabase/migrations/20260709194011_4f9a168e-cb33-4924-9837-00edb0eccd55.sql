-- Make server-only write intent explicit on pulse_run_recipients.
-- RLS already blocks writes by default (no write policy exists), but the
-- scanner cannot infer intent — add explicit deny policies so client-side
-- INSERT/UPDATE/DELETE are unambiguously rejected. Edge functions using
-- the service_role key bypass RLS and remain unaffected.

CREATE POLICY "pulse_run_recipients_no_client_insert"
  ON public.pulse_run_recipients
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "pulse_run_recipients_no_client_update"
  ON public.pulse_run_recipients
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "pulse_run_recipients_no_client_delete"
  ON public.pulse_run_recipients
  FOR DELETE
  TO authenticated, anon
  USING (false);