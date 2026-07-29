REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;