-- 1. Add email_pessoal column to people and pending_people
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS email_pessoal text;
ALTER TABLE public.pending_people ADD COLUMN IF NOT EXISTS email_pessoal text;

-- 2. Unique partial index on people.email_pessoal (case-insensitive, allows NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS people_email_pessoal_unique_idx
  ON public.people (lower(email_pessoal))
  WHERE email_pessoal IS NOT NULL;

-- 3. Extend approve_pending_person to accept p_email_pessoal
CREATE OR REPLACE FUNCTION public.approve_pending_person(
  p_pending_id uuid,
  p_reviewer_id text,
  p_director_notes text DEFAULT NULL,
  p_nome text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_cargo text DEFAULT NULL,
  p_local text DEFAULT NULL,
  p_sub_time text DEFAULT NULL,
  p_gestor_id text DEFAULT NULL,
  p_data_contrato date DEFAULT NULL,
  p_modelo_contrato text DEFAULT NULL,
  p_data_nascimento date DEFAULT NULL,
  p_dia_pagamento integer DEFAULT NULL,
  p_email_pessoal text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pending_record pending_people%ROWTYPE;
  v_new_person_id text;
  v_final_email text;
  v_final_email_pessoal text;
  v_slack_user_id text;
  v_linked_to int := 0;
  v_linked_from int := 0;
  k record;
BEGIN
  SELECT * INTO v_pending_record
  FROM pending_people
  WHERE id = p_pending_id AND status = 'PENDENTE';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cadastro pendente não encontrado');
  END IF;

  v_final_email := COALESCE(p_email, v_pending_record.email);
  v_slack_user_id := v_pending_record.slack_user_id;

  -- Resolve email_pessoal: explicit param wins, else carry from pending row
  v_final_email_pessoal := COALESCE(NULLIF(trim(p_email_pessoal), ''), NULLIF(trim(v_pending_record.email_pessoal), ''));
  IF v_final_email_pessoal IS NOT NULL THEN
    v_final_email_pessoal := lower(v_final_email_pessoal);
    IF v_final_email_pessoal !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Email pessoal inválido');
    END IF;
    IF EXISTS (SELECT 1 FROM people WHERE lower(email_pessoal) = v_final_email_pessoal) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Este email pessoal já está cadastrado para outro colaborador');
    END IF;
  END IF;

  IF v_final_email IS NOT NULL AND EXISTS (SELECT 1 FROM people WHERE lower(email) = lower(v_final_email)) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Email já cadastrado no sistema');
  END IF;

  v_new_person_id := 'pessoa_' || LPAD((
    SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 8) AS INTEGER)), 0) + 1
    FROM people
    WHERE id LIKE 'pessoa_%'
  )::text, 3, '0');

  INSERT INTO people (
    id, nome, email, cargo, local, sub_time,
    papel, gestor_id, data_contrato, data_nascimento,
    modelo_contrato, ativo, is_admin, dia_pagamento, slack_user_id, email_pessoal
  ) VALUES (
    v_new_person_id,
    COALESCE(p_nome, v_pending_record.nome),
    v_final_email,
    COALESCE(p_cargo, v_pending_record.cargo),
    COALESCE(p_local, v_pending_record.local),
    COALESCE(p_sub_time, v_pending_record.sub_time),
    v_pending_record.papel,
    COALESCE(p_gestor_id, v_pending_record.gestor_id),
    COALESCE(p_data_contrato, v_pending_record.data_contrato),
    COALESCE(p_data_nascimento, v_pending_record.data_nascimento),
    COALESCE(p_modelo_contrato, v_pending_record.modelo_contrato),
    true,
    false,
    COALESCE(p_dia_pagamento, v_pending_record.dia_pagamento),
    v_slack_user_id,
    v_final_email_pessoal
  );

  UPDATE pending_people
  SET status = 'APROVADO',
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      director_notes = p_director_notes
  WHERE id = p_pending_id;

  FOR k IN
    SELECT id FROM kudos
    WHERE pending_to = true
      AND (
        (v_slack_user_id IS NOT NULL AND to_slack_user_id = v_slack_user_id)
        OR (v_final_email IS NOT NULL AND lower(to_slack_email) = lower(v_final_email))
      )
  LOOP
    UPDATE kudos SET to_person_id = v_new_person_id, pending_to = false WHERE id = k.id;
    PERFORM public.award_points(v_new_person_id, 10, 'kudo_received'::engagement_reason, k.id::text);
    v_linked_to := v_linked_to + 1;
  END LOOP;

  FOR k IN
    SELECT id FROM kudos
    WHERE pending_from = true
      AND (
        (v_slack_user_id IS NOT NULL AND from_slack_user_id = v_slack_user_id)
        OR (v_final_email IS NOT NULL AND lower(from_slack_email) = lower(v_final_email))
      )
  LOOP
    UPDATE kudos SET from_person_id = v_new_person_id, pending_from = false WHERE id = k.id;
    PERFORM public.award_points(v_new_person_id, 2, 'kudo_given'::engagement_reason, k.id::text);
    v_linked_from := v_linked_from + 1;
  END LOOP;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES (
    'pending_people',
    p_pending_id::text,
    'APPROVE_PERSON',
    p_reviewer_id,
    jsonb_build_object(
      'new_person_id', v_new_person_id,
      'director_notes', p_director_notes,
      'linked_kudos_received', v_linked_to,
      'linked_kudos_given', v_linked_from,
      'slack_user_id', v_slack_user_id,
      'email_pessoal', v_final_email_pessoal,
      'source', v_pending_record.source
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'person_id', v_new_person_id,
    'linked_kudos_received', v_linked_to,
    'linked_kudos_given', v_linked_from,
    'message', 'Colaborador aprovado e cadastrado com sucesso'
  );
END;
$function$;

-- 4. Extend update_profile_for_current_user with optional p_email_pessoal
CREATE OR REPLACE FUNCTION public.update_profile_for_current_user(
  p_nome text,
  p_email text,
  p_data_nascimento date,
  p_email_pessoal text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_person_id text;
  old_data jsonb;
  new_data jsonb;
  v_new_pessoal text;
BEGIN
  SELECT person_id INTO user_person_id FROM profiles WHERE user_id = auth.uid();
  IF user_person_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- Normalize / validate optional personal email
  IF p_email_pessoal IS NULL OR length(trim(p_email_pessoal)) = 0 THEN
    v_new_pessoal := NULL;
  ELSE
    v_new_pessoal := lower(trim(p_email_pessoal));
    IF v_new_pessoal !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
      RAISE EXCEPTION 'Email pessoal inválido';
    END IF;
    IF EXISTS (SELECT 1 FROM people WHERE lower(email_pessoal) = v_new_pessoal AND id <> user_person_id) THEN
      RAISE EXCEPTION 'Este email pessoal já está cadastrado para outro colaborador';
    END IF;
  END IF;

  SELECT to_jsonb(p.*) INTO old_data FROM people p WHERE id = user_person_id;

  UPDATE people
  SET nome = p_nome,
      email = p_email,
      data_nascimento = p_data_nascimento,
      email_pessoal = v_new_pessoal,
      updated_at = now()
  WHERE id = user_person_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found';
  END IF;

  SELECT to_jsonb(p.*) INTO new_data FROM people p WHERE id = user_person_id;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES ('people', user_person_id, 'UPDATE_PROFILE', user_person_id,
          json_build_object('old', old_data, 'new', new_data));
END;
$function$;

-- 5. Extend complete_own_profile with optional p_email_pessoal
CREATE OR REPLACE FUNCTION public.complete_own_profile(
  p_data_nascimento date,
  p_cargo text,
  p_sub_time text,
  p_local text,
  p_data_contrato date,
  p_modelo_contrato text,
  p_dia_pagamento integer DEFAULT NULL,
  p_corporate_email text DEFAULT NULL,
  p_email_pessoal text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_person_id text;
  v_current_email text;
  v_current_pessoal text;
  v_new_email text;
  v_new_pessoal text;
BEGIN
  SELECT person_id INTO v_person_id FROM profiles WHERE user_id = auth.uid();
  IF v_person_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil não encontrado');
  END IF;

  IF p_data_nascimento IS NULL OR p_cargo IS NULL OR p_sub_time IS NULL
     OR p_data_contrato IS NULL OR p_modelo_contrato IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Campos obrigatórios não preenchidos');
  END IF;

  SELECT email, email_pessoal INTO v_current_email, v_current_pessoal FROM people WHERE id = v_person_id;

  -- Resolve corporate email
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

  -- Resolve personal email
  IF p_email_pessoal IS NULL OR length(trim(p_email_pessoal)) = 0 THEN
    v_new_pessoal := v_current_pessoal;
  ELSE
    v_new_pessoal := lower(trim(p_email_pessoal));
    IF v_new_pessoal !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Email pessoal inválido');
    END IF;
    IF EXISTS (SELECT 1 FROM people WHERE lower(email_pessoal) = v_new_pessoal AND id <> v_person_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Este email pessoal já está cadastrado para outro colaborador');
    END IF;
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
    email_pessoal = v_new_pessoal,
    profile_completed_at = now(),
    updated_at = now()
  WHERE id = v_person_id;

  IF v_new_email IS DISTINCT FROM v_current_email THEN
    INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
    VALUES ('people', v_person_id, 'CORPORATE_EMAIL_SET', v_person_id,
            jsonb_build_object('old_email', v_current_email, 'new_email', v_new_email));
  END IF;

  IF v_new_pessoal IS DISTINCT FROM v_current_pessoal THEN
    INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
    VALUES ('people', v_person_id, 'PERSONAL_EMAIL_SET', v_person_id,
            jsonb_build_object('old_email_pessoal', v_current_pessoal, 'new_email_pessoal', v_new_pessoal));
  END IF;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES ('people', v_person_id, 'COMPLETE_PROFILE', v_person_id,
          jsonb_build_object(
            'data_nascimento', p_data_nascimento,
            'cargo', p_cargo,
            'sub_time', p_sub_time,
            'local', p_local,
            'data_contrato', p_data_contrato,
            'modelo_contrato', p_modelo_contrato,
            'dia_pagamento', p_dia_pagamento
          ));

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 6. Extend link_profile_personal_email to also accept email_pessoal match
CREATE OR REPLACE FUNCTION public.link_profile_personal_email(p_person_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_email text;
  v_person people%ROWTYPE;
  v_existing uuid;
  v_match_method text;
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

  -- Accept if (a) the person has a slack_user_id OR (b) auth email matches the cadastrado email_pessoal
  IF v_person.email_pessoal IS NOT NULL
     AND v_auth_email IS NOT NULL
     AND lower(v_person.email_pessoal) = lower(v_auth_email) THEN
    v_match_method := 'email_pessoal_match';
  ELSIF v_person.slack_user_id IS NOT NULL AND length(trim(v_person.slack_user_id)) > 0 THEN
    v_match_method := 'slack_user_id';
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Esse colaborador ainda não foi validado pelo Slack nem tem o seu email cadastrado como email pessoal. Peça ao diretor para aprovar/cadastrar primeiro.'
    );
  END IF;

  -- Auto-store personal email if linking via Slack-only path and people.email_pessoal is empty
  IF v_match_method = 'slack_user_id'
     AND v_person.email_pessoal IS NULL
     AND v_auth_email IS NOT NULL
     AND lower(v_auth_email) <> lower(COALESCE(v_person.email, '')) THEN
    UPDATE people SET email_pessoal = lower(v_auth_email), updated_at = now()
    WHERE id = p_person_id
      AND NOT EXISTS (SELECT 1 FROM people WHERE lower(email_pessoal) = lower(v_auth_email));
  END IF;

  INSERT INTO profiles (user_id, person_id)
  VALUES (auth.uid(), p_person_id);

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES ('people', p_person_id, 'LINK_PERSONAL_EMAIL', p_person_id,
          jsonb_build_object(
            'auth_email', v_auth_email,
            'people_email', v_person.email,
            'email_pessoal', v_person.email_pessoal,
            'slack_user_id', v_person.slack_user_id,
            'match_method', v_match_method
          ));

  RETURN jsonb_build_object('success', true, 'message', 'Perfil vinculado com sucesso');
END;
$function$;