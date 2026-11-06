DROP POLICY IF EXISTS "Authenticated can read teams" ON public.teams;
CREATE POLICY "Linked employees can read teams" ON public.teams FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()));
DROP POLICY IF EXISTS "Authenticated read settings" ON public.system_settings;
CREATE POLICY "Linked employees can read settings" ON public.system_settings FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid()));