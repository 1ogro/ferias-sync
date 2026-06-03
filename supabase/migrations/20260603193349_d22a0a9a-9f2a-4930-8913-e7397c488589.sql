
CREATE OR REPLACE FUNCTION public.link_profile_with_figma_email(
  p_person_id text,
  p_figma_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_email text;
  v_old_email text;
  v_existing_profile uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado');
  END IF;

  -- Validate that the provided email matches the authenticated user's email
  SELECT email INTO v_auth_email FROM auth.users WHERE id = auth.uid();

  IF v_auth_email IS NULL OR lower(v_auth_email) <> lower(p_figma_email) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email do Figma não confere com o usuário autenticado');
  END IF;

  -- Make sure user doesn't already have a profile
  SELECT id INTO v_existing_profile FROM profiles WHERE user_id = auth.uid();
  IF v_existing_profile IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil já vinculado');
  END IF;

  -- Capture current people.email
  SELECT email INTO v_old_email FROM people WHERE id = p_person_id AND ativo = true;
  IF v_old_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Colaborador não encontrado ou inativo');
  END IF;

  -- Ensure no other person already uses that email
  IF EXISTS (SELECT 1 FROM people WHERE lower(email) = lower(p_figma_email) AND id <> p_person_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Este email já está vinculado a outro colaborador');
  END IF;

  -- Update people.email if different
  IF lower(v_old_email) <> lower(p_figma_email) THEN
    UPDATE people
    SET email = p_figma_email, updated_at = now()
    WHERE id = p_person_id;

    INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
    VALUES (
      'people',
      p_person_id,
      'FIGMA_EMAIL_INHERITED',
      p_person_id,
      jsonb_build_object('old_email', v_old_email, 'new_email', p_figma_email)
    );
  END IF;

  -- Create profile link
  INSERT INTO profiles (user_id, person_id)
  VALUES (auth.uid(), p_person_id);

  RETURN jsonb_build_object('success', true, 'message', 'Perfil vinculado com sucesso');
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_profile_with_figma_email(text, text) TO authenticated;
