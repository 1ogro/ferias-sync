ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS registration_reminders_slack boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_audit_logs_acao_created_at
  ON public.audit_logs (acao, created_at DESC);