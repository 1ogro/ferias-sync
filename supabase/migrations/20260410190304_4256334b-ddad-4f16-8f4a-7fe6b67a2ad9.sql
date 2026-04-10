
CREATE OR REPLACE FUNCTION public.get_director_emails()
RETURNS TABLE(email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.email
  FROM people p
  WHERE p.papel = 'DIRETOR'
    AND p.ativo = true;
$$;
