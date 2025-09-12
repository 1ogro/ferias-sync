-- Grant execute permission to both anon and authenticated users for the signup function
-- This is needed because users setting up their profile might not be fully authenticated yet
REVOKE EXECUTE ON FUNCTION public.get_active_people_for_signup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_people_for_signup() TO anon;
GRANT EXECUTE ON FUNCTION public.get_active_people_for_signup() TO authenticated;