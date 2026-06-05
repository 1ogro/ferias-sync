CREATE OR REPLACE FUNCTION public.cleanup_orphan_profiles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas admins podem limpar perfis órfãos';
  END IF;

  WITH del AS (
    DELETE FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = p.user_id
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM del;

  RETURN v_deleted;
END;
$$;

-- One-time cleanup of existing orphan profiles (bypasses the admin check above)
DELETE FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id = p.user_id
);