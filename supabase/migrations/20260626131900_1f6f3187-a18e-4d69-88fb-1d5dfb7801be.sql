
-- =============================================================
-- 1) kudos: hide slack emails from the public feed
-- =============================================================
DROP POLICY IF EXISTS "Authenticated can read all kudos" ON public.kudos;

CREATE POLICY "Kudos: own or admin can read full row"
ON public.kudos
FOR SELECT
TO authenticated
USING (
  is_admin_or_director()
  OR from_person_id = current_person_id()
  OR to_person_id = current_person_id()
);

CREATE OR REPLACE VIEW public.kudos_feed_safe
WITH (security_invoker = false) AS
SELECT
  k.id,
  k.from_person_id,
  k.to_person_id,
  k.from_slack_name,
  k.to_slack_name,
  k.from_slack_user_id,
  k.to_slack_user_id,
  k.pending_from,
  k.pending_to,
  k.message,
  k.category,
  k.slack_channel_posted,
  k.created_at
FROM public.kudos k;

GRANT SELECT ON public.kudos_feed_safe TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kudos TO authenticated;
GRANT ALL ON public.kudos TO service_role;

-- =============================================================
-- 2) engagement_points: remove from realtime publication
--    (SELECT policy still allows team/manager reads via regular queries,
--     but Realtime broadcast is no longer issued to all subscribers.)
-- =============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'engagement_points'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.engagement_points';
  END IF;
END$$;

-- =============================================================
-- 3) pulse_responses: explicit deny on direct INSERT by authenticated users
--    (service_role used by edge functions bypasses RLS.)
-- =============================================================
DROP POLICY IF EXISTS pulse_responses_insert_deny ON public.pulse_responses;
CREATE POLICY pulse_responses_insert_deny
ON public.pulse_responses
FOR INSERT
TO authenticated
WITH CHECK (false);

-- =============================================================
-- 4) pulse_responses: tighten base SELECT and switch safe view to definer
--    so respondent_id in anonymous surveys is never visible to creators.
-- =============================================================
DROP POLICY IF EXISTS pulse_responses_select ON public.pulse_responses;
CREATE POLICY pulse_responses_select_admin
ON public.pulse_responses
FOR SELECT
TO authenticated
USING (is_admin_or_director());

ALTER VIEW public.pulse_responses_safe SET (security_invoker = false);
GRANT SELECT ON public.pulse_responses_safe TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pulse_responses TO authenticated;
GRANT ALL ON public.pulse_responses TO service_role;
