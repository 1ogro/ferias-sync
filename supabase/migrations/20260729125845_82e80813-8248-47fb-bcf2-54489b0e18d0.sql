REVOKE ALL ON FUNCTION public.can_link_profile_to_person(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_link_profile_to_person(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_link_profile_to_person(text) TO service_role;