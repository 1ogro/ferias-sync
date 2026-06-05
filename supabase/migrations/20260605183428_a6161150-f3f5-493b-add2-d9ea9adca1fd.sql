
-- Function: get manager deletion impact
CREATE OR REPLACE FUNCTION public.get_manager_deletion_impact(p_person_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_papel text;
  caller_is_admin boolean;
  v_subordinates jsonb;
  v_pending_requests jsonb;
  v_pending_people jsonb;
BEGIN
  SELECT per.papel, per.is_admin
  INTO caller_papel, caller_is_admin
  FROM profiles prof
  JOIN people per ON prof.person_id = per.id
  WHERE prof.user_id = auth.uid();

  IF NOT (caller_is_admin = true OR caller_papel IN ('DIRETOR', 'ADMIN')) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'email', email) ORDER BY nome), '[]'::jsonb)
  INTO v_subordinates
  FROM people
  WHERE gestor_id = p_person_id AND ativo = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'requester_id', r.requester_id,
    'requester_nome', p.nome,
    'tipo', r.tipo,
    'inicio', r.inicio,
    'fim', r.fim,
    'status', r.status
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_pending_requests
  FROM requests r
  JOIN people p ON p.id = r.requester_id
  WHERE p.gestor_id = p_person_id
    AND p.ativo = true
    AND r.status IN ('PENDENTE', 'INFORMACOES_ADICIONAIS');

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'email', email) ORDER BY nome), '[]'::jsonb)
  INTO v_pending_people
  FROM pending_people
  WHERE status = 'PENDENTE' AND (gestor_id = p_person_id OR created_by = p_person_id);

  RETURN jsonb_build_object(
    'subordinates', v_subordinates,
    'pending_requests', v_pending_requests,
    'pending_people', v_pending_people,
    'counts', jsonb_build_object(
      'subordinates', jsonb_array_length(v_subordinates),
      'pending_requests', jsonb_array_length(v_pending_requests),
      'pending_people', jsonb_array_length(v_pending_people)
    )
  );
END;
$$;

-- Function: reassign team and delete manager
CREATE OR REPLACE FUNCTION public.reassign_and_delete_person(
  p_person_id text,
  p_new_manager_id text,
  p_justification text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_person_id text;
  caller_papel text;
  caller_is_admin boolean;
  v_new_manager people%ROWTYPE;
  v_target people%ROWTYPE;
  v_subordinates_count int := 0;
  v_pending_people_count int := 0;
  v_pending_requests_count int := 0;
BEGIN
  -- Authorization
  SELECT prof.person_id, per.papel, per.is_admin
  INTO caller_person_id, caller_papel, caller_is_admin
  FROM profiles prof
  JOIN people per ON prof.person_id = per.id
  WHERE prof.user_id = auth.uid();

  IF NOT (caller_is_admin = true OR caller_papel IN ('DIRETOR', 'ADMIN')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso negado');
  END IF;

  -- Validate target
  SELECT * INTO v_target FROM people WHERE id = p_person_id;
  IF v_target.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pessoa não encontrada');
  END IF;

  -- Validate new manager
  IF p_new_manager_id = p_person_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'O novo gestor não pode ser a mesma pessoa');
  END IF;

  SELECT * INTO v_new_manager FROM people WHERE id = p_new_manager_id;
  IF v_new_manager.id IS NULL OR v_new_manager.ativo = false THEN
    RETURN jsonb_build_object('success', false, 'message', 'Novo gestor não encontrado ou inativo');
  END IF;

  IF v_new_manager.papel NOT IN ('GESTOR', 'DIRETOR', 'ADMIN') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Novo gestor deve ter papel GESTOR ou DIRETOR');
  END IF;

  -- Count pending requests before reassignment (for audit)
  SELECT COUNT(*)
  INTO v_pending_requests_count
  FROM requests r
  JOIN people p ON p.id = r.requester_id
  WHERE p.gestor_id = p_person_id
    AND p.ativo = true
    AND r.status IN ('PENDENTE', 'INFORMACOES_ADICIONAIS');

  -- Reassign active subordinates
  WITH upd AS (
    UPDATE people
    SET gestor_id = p_new_manager_id, updated_at = now()
    WHERE gestor_id = p_person_id AND ativo = true
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_subordinates_count FROM upd;

  -- Reassign pending_people
  WITH upd AS (
    UPDATE pending_people
    SET gestor_id = p_new_manager_id
    WHERE status = 'PENDENTE' AND gestor_id = p_person_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_pending_people_count FROM upd;

  -- Also update created_by on pending_people if needed (optional - keep for traceability, do not change created_by)

  -- Audit reassignment
  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES (
    'people',
    p_person_id,
    'REASSIGN_MANAGER',
    caller_person_id,
    jsonb_build_object(
      'old_manager_id', p_person_id,
      'old_manager_name', v_target.nome,
      'new_manager_id', p_new_manager_id,
      'new_manager_name', v_new_manager.nome,
      'justification', p_justification,
      'counts', jsonb_build_object(
        'subordinates', v_subordinates_count,
        'pending_requests', v_pending_requests_count,
        'pending_people', v_pending_people_count
      )
    )
  );

  -- Delete the manager
  DELETE FROM people WHERE id = p_person_id;

  -- Audit final deletion with reassign context
  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES (
    'people',
    p_person_id,
    'DELETE_WITH_REASSIGN',
    caller_person_id,
    jsonb_build_object(
      'deleted_person', jsonb_build_object('id', v_target.id, 'nome', v_target.nome, 'email', v_target.email),
      'new_manager_id', p_new_manager_id,
      'justification', p_justification
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Equipe reatribuída e gestor excluído com sucesso',
    'counts', jsonb_build_object(
      'subordinates', v_subordinates_count,
      'pending_requests', v_pending_requests_count,
      'pending_people', v_pending_people_count
    ),
    'new_manager', jsonb_build_object('id', v_new_manager.id, 'nome', v_new_manager.nome)
  );
END;
$$;
