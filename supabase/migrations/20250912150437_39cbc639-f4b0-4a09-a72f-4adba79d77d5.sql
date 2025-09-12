-- Grant execute permission to authenticated users for the signup function
GRANT EXECUTE ON FUNCTION public.get_active_people_for_signup() TO authenticated;