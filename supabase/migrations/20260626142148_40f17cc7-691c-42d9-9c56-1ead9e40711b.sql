CREATE OR REPLACE FUNCTION public.get_active_people_for_kudos()
RETURNS TABLE(id text, nome text, sub_time text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome, p.sub_time
  FROM people p
  WHERE p.ativo = true
  ORDER BY p.nome;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_people_for_kudos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_people_for_kudos() TO authenticated;