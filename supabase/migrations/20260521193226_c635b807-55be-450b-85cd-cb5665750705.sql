CREATE OR REPLACE FUNCTION public.get_figma_login_status()
RETURNS TABLE(figma_enabled boolean, figma_status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(figma_enabled, false) AS figma_enabled,
         COALESCE(figma_status, 'not_configured') AS figma_status
  FROM integration_settings
  WHERE id = '00000000-0000-0000-0000-000000000000'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_figma_login_status() TO anon, authenticated;