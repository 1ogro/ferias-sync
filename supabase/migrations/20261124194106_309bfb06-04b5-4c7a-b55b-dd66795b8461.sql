DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND (
      p.prorettype='trigger'::regtype OR p.proname IN
      ('award_points','cleanup_orphan_profiles','reassign_and_delete_person','mark_profile_completed','update_own_birthdate','get_wellbeing_team_weekly'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
DROP INDEX IF EXISTS public.idx_peer_pairs_unique;