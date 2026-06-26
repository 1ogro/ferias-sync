
-- 1) link_profile_personal_email
CREATE OR REPLACE FUNCTION public.link_profile_personal_email(p_person_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_email text;
  v_person people%ROWTYPE;
  v_existing uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado');
  END IF;

  SELECT id INTO v_existing FROM profiles WHERE user_id = auth.uid();
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil já vinculado');
  END IF;

  SELECT email INTO v_auth_email FROM auth.users WHERE id = auth.uid();

  SELECT * INTO v_person FROM people WHERE id = p_person_id;
  IF v_person.id IS NULL OR v_person.ativo = false THEN
    RETURN jsonb_build_object('success', false, 'message', 'Colaborador não encontrado ou inativo');
  END IF;

  IF v_person.slack_user_id IS NULL OR length(trim(v_person.slack_user_id)) = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Esse colaborador ainda não foi validado pelo Slack. Peça ao diretor para aprovar o cadastro primeiro.'
    );
  END IF;

  INSERT INTO profiles (user_id, person_id)
  VALUES (auth.uid(), p_person_id);

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES (
    'people',
    p_person_id,
    'LINK_PERSONAL_EMAIL',
    p_person_id,
    jsonb_build_object(
      'auth_email', v_auth_email,
      'people_email', v_person.email,
      'slack_user_id', v_person.slack_user_id
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'Perfil vinculado com sucesso');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.link_profile_personal_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_profile_personal_email(text) TO authenticated;

-- 2) Estender complete_own_profile com email corporativo opcional
CREATE OR REPLACE FUNCTION public.complete_own_profile(
  p_data_nascimento date,
  p_cargo text,
  p_sub_time text,
  p_local text,
  p_data_contrato date,
  p_modelo_contrato text,
  p_dia_pagamento integer DEFAULT NULL,
  p_corporate_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_id text;
  v_current_email text;
  v_new_email text;
BEGIN
  SELECT person_id INTO v_person_id FROM profiles WHERE user_id = auth.uid();
  IF v_person_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil não encontrado');
  END IF;

  IF p_data_nascimento IS NULL OR p_cargo IS NULL OR p_sub_time IS NULL
     OR p_data_contrato IS NULL OR p_modelo_contrato IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Campos obrigatórios não preenchidos');
  END IF;

  SELECT email INTO v_current_email FROM people WHERE id = v_person_id;

  -- Decide o email final
  IF v_current_email IS NULL OR lower(v_current_email) !~ '@rededor\.com\.br$' THEN
    IF p_corporate_email IS NULL OR length(trim(p_corporate_email)) = 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Informe um email corporativo @rededor.com.br');
    END IF;
    v_new_email := lower(trim(p_corporate_email));
    IF v_new_email !~ '@rededor\.com\.br$' THEN
      RETURN jsonb_build_object('success', false, 'message', 'O email corporativo deve terminar em @rededor.com.br');
    END IF;
    IF EXISTS (SELECT 1 FROM people WHERE lower(email) = v_new_email AND id <> v_person_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Este email já está cadastrado para outro colaborador');
    END IF;
  ELSE
    v_new_email := v_current_email;
  END IF;

  UPDATE people SET
    data_nascimento = p_data_nascimento,
    cargo = p_cargo,
    sub_time = p_sub_time,
    local = NULLIF(p_local, ''),
    data_contrato = p_data_contrato,
    modelo_contrato = p_modelo_contrato,
    dia_pagamento = CASE WHEN p_modelo_contrato = 'PJ' THEN p_dia_pagamento ELSE NULL END,
    email = v_new_email,
    profile_completed_at = now(),
    updated_at = now()
  WHERE id = v_person_id;

  IF v_new_email IS DISTINCT FROM v_current_email THEN
    INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
    VALUES (
      'people', v_person_id, 'CORPORATE_EMAIL_SET', v_person_id,
      jsonb_build_object('old_email', v_current_email, 'new_email', v_new_email)
    );
  END IF;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES (
    'people', v_person_id, 'COMPLETE_PROFILE', v_person_id,
    jsonb_build_object(
      'data_nascimento', p_data_nascimento,
      'cargo', p_cargo,
      'sub_time', p_sub_time,
      'local', p_local,
      'data_contrato', p_data_contrato,
      'modelo_contrato', p_modelo_contrato,
      'dia_pagamento', p_dia_pagamento
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
