
-- Create notification_preferences table
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id text NOT NULL UNIQUE REFERENCES public.people(id) ON DELETE CASCADE,
  birthday_email boolean NOT NULL DEFAULT true,
  birthday_slack boolean NOT NULL DEFAULT false,
  request_updates_email boolean NOT NULL DEFAULT true,
  request_updates_slack boolean NOT NULL DEFAULT true,
  system_alerts_email boolean NOT NULL DEFAULT true,
  system_alerts_slack boolean NOT NULL DEFAULT false,
  admin_actions_email boolean NOT NULL DEFAULT true,
  admin_actions_slack boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view their own preferences
CREATE POLICY "Users can view own notification preferences"
ON public.notification_preferences FOR SELECT
TO authenticated
USING (person_id IN (SELECT person_id FROM profiles WHERE user_id = auth.uid()));

-- Users can insert their own preferences
CREATE POLICY "Users can insert own notification preferences"
ON public.notification_preferences FOR INSERT
TO authenticated
WITH CHECK (person_id IN (SELECT person_id FROM profiles WHERE user_id = auth.uid()));

-- Users can update their own preferences
CREATE POLICY "Users can update own notification preferences"
ON public.notification_preferences FOR UPDATE
TO authenticated
USING (person_id IN (SELECT person_id FROM profiles WHERE user_id = auth.uid()));

-- Admins can view all preferences (for edge functions via service role, but also for admin UI)
CREATE POLICY "Admins can view all notification preferences"
ON public.notification_preferences FOR SELECT
TO authenticated
USING (is_current_user_admin());

-- Add updated_at trigger
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
