CREATE OR REPLACE FUNCTION public.can_link_profile_to_person(_person_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.people p
    WHERE p.id = _person_id
      AND p.ativo = true
      AND (
        lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        OR lower(coalesce(p.email_pessoal, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.can_link_profile_to_person(text) TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER POLICY "Users can create their own profile"
ON public.profiles
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.can_link_profile_to_person(person_id)
);

ALTER POLICY "Users can update their own profile"
ON public.profiles
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND public.can_link_profile_to_person(person_id)
);

ALTER POLICY "Users can view their own profile"
ON public.profiles
TO authenticated
USING (user_id = auth.uid());