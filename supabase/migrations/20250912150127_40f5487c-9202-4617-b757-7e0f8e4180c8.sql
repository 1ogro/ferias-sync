-- Remove the overly permissive policy
DROP POLICY "Public can view active people for signup" ON public.people;

-- Create a secure function that only returns minimal signup data
CREATE OR REPLACE FUNCTION public.get_active_people_for_signup()
RETURNS TABLE(id text, nome text, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome, p.email 
  FROM people p 
  WHERE p.ativo = true
  ORDER BY p.nome;
$$;

-- Grant execute permission to anonymous users for this specific function
GRANT EXECUTE ON FUNCTION public.get_active_people_for_signup() TO anon;