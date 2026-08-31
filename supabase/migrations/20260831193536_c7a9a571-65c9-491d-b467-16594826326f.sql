
-- 1) FK adjustments
ALTER TABLE public.pulse_responses DROP CONSTRAINT IF EXISTS pulse_responses_respondent_id_fkey;
ALTER TABLE public.pulse_responses ADD CONSTRAINT pulse_responses_respondent_id_fkey
  FOREIGN KEY (respondent_id) REFERENCES public.people(id) ON DELETE CASCADE;

ALTER TABLE public.pulse_surveys DROP CONSTRAINT IF EXISTS pulse_surveys_created_by_fkey;
ALTER TABLE public.pulse_surveys ADD CONSTRAINT pulse_surveys_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE CASCADE;

ALTER TABLE public.medical_leaves DROP CONSTRAINT IF EXISTS fk_medical_leaves_person;
ALTER TABLE public.medical_leaves ADD CONSTRAINT fk_medical_leaves_person
  FOREIGN KEY (person_id) REFERENCES public.people(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.special_approvals DROP CONSTRAINT IF EXISTS fk_special_approvals_manager;
ALTER TABLE public.special_approvals ADD CONSTRAINT fk_special_approvals_manager
  FOREIGN KEY (manager_id) REFERENCES public.people(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.medical_leaves ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.medical_leaves DROP CONSTRAINT IF EXISTS fk_medical_leaves_created_by;
ALTER TABLE public.medical_leaves ADD CONSTRAINT fk_medical_leaves_created_by
  FOREIGN KEY (created_by) REFERENCES public.people(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.payment_day_change_requests DROP CONSTRAINT IF EXISTS payment_day_change_requests_reviewed_by_fkey;
ALTER TABLE public.payment_day_change_requests ADD CONSTRAINT payment_day_change_requests_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES public.people(id) ON DELETE SET NULL;

-- 2) Impact summary with extra counts
CREATE OR REPLACE FUNCTION public.get_manager_deletion_impact(p_person_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    ),
    'cascade_counts', jsonb_build_object(
      'requests', (SELECT COUNT(*) FROM requests WHERE requester_id = p_person_id),
      'pulse_responses', (SELECT COUNT(*) FROM pulse_responses WHERE respondent_id = p_person_id),
      'pulse_surveys', (SELECT COUNT(*) FROM pulse_surveys WHERE created_by = p_person_id),
      'medical_leaves', (SELECT COUNT(*) FROM medical_leaves WHERE person_id = p_person_id),
      'special_approvals', (SELECT COUNT(*) FROM special_approvals WHERE manager_id = p_person_id),
      'kudos', (SELECT COUNT(*) FROM kudos WHERE from_person_id = p_person_id OR to_person_id = p_person_id),
      'engagement_points', (SELECT COUNT(*) FROM engagement_points WHERE person_id = p_person_id)
    )
  );
END;
$function$;

-- 3) Deactivate person (default action)
CREATE OR REPLACE FUNCTION public.deactivate_person(p_person_id text, p_justification text DEFAULT NULL::text, p_new_manager_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_person_id text;
  caller_papel text;
  caller_is_admin boolean;
  v_target people%ROWTYPE;
  v_new_manager people%ROWTYPE;
  v_subordinates int := 0;
  v_pending_people int := 0;
BEGIN
  SELECT prof.person_id, per.papel, per.is_admin
  INTO caller_person_id, caller_papel, caller_is_admin
  FROM profiles prof
  JOIN people per ON prof.person_id = per.id
  WHERE prof.user_id = auth.uid();

  IF NOT (caller_is_admin = true OR caller_papel IN ('DIRETOR', 'ADMIN')) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso negado');
  END IF;

  SELECT * INTO v_target FROM people WHERE id = p_person_id;
  IF v_target.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pessoa não encontrada');
  END IF;
  IF v_target.ativo = false THEN
    RETURN jsonb_build_object('success', false, 'message', 'Colaborador já está inativo');
  END IF;
  IF v_target.id = caller_person_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Você não pode inativar o seu próprio cadastro');
  END IF;

  IF p_new_manager_id IS NOT NULL THEN
    IF p_new_manager_id = p_person_id THEN
      RETURN jsonb_build_object('success', false, 'message', 'O novo gestor não pode ser a mesma pessoa');
    END IF;
    SELECT * INTO v_new_manager FROM people WHERE id = p_new_manager_id;
    IF v_new_manager.id IS NULL OR v_new_manager.ativo = false THEN
      RETURN jsonb_build_object('success', false, 'message', 'Novo gestor não encontrado ou inativo');
    END IF;
    IF v_new_manager.papel NOT IN ('GESTOR', 'GERENTE', 'DIRETOR', 'ADMIN') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Novo gestor deve ter papel de liderança');
    END IF;

    WITH upd AS (
      UPDATE people SET gestor_id = p_new_manager_id, updated_at = now()
      WHERE gestor_id = p_person_id AND ativo = true
      RETURNING 1
    ) SELECT COUNT(*) INTO v_subordinates FROM upd;

    WITH upd AS (
      UPDATE pending_people SET gestor_id = p_new_manager_id
      WHERE status = 'PENDENTE' AND gestor_id = p_person_id
      RETURNING 1
    ) SELECT COUNT(*) INTO v_pending_people FROM upd;
  END IF;

  UPDATE people SET ativo = false, updated_at = now() WHERE id = p_person_id;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES ('people', p_person_id, 'DEACTIVATE_PERSON', caller_person_id,
    jsonb_build_object(
      'nome', v_target.nome,
      'email', v_target.email,
      'justification', p_justification,
      'new_manager_id', p_new_manager_id,
      'counts', jsonb_build_object('subordinates', v_subordinates, 'pending_people', v_pending_people)
    ));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Colaborador inativado com sucesso',
    'counts', jsonb_build_object('subordinates', v_subordinates, 'pending_people', v_pending_people)
  );
END;
$function$;

-- 4) Permanent delete (admins only)
CREATE OR REPLACE FUNCTION public.delete_person_permanently(p_person_id text, p_justification text DEFAULT NULL::text, p_new_manager_id text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_person_id text;
  caller_papel text;
  caller_is_admin boolean;
  v_target people%ROWTYPE;
  v_new_manager people%ROWTYPE;
  v_subordinates int := 0;
  v_pending_people int := 0;
BEGIN
  SELECT prof.person_id, per.papel, per.is_admin
  INTO caller_person_id, caller_papel, caller_is_admin
  FROM profiles prof
  JOIN people per ON prof.person_id = per.id
  WHERE prof.user_id = auth.uid();

  IF NOT (caller_is_admin = true OR caller_papel = 'ADMIN') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas administradores podem excluir definitivamente');
  END IF;

  IF p_justification IS NULL OR length(trim(p_justification)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Justificativa obrigatória');
  END IF;

  SELECT * INTO v_target FROM people WHERE id = p_person_id;
  IF v_target.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pessoa não encontrada');
  END IF;
  IF v_target.id = caller_person_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Você não pode excluir o seu próprio cadastro');
  END IF;

  IF p_new_manager_id IS NOT NULL THEN
    SELECT * INTO v_new_manager FROM people WHERE id = p_new_manager_id;
    IF v_new_manager.id IS NULL OR v_new_manager.ativo = false THEN
      RETURN jsonb_build_object('success', false, 'message', 'Novo gestor não encontrado ou inativo');
    END IF;

    WITH upd AS (
      UPDATE people SET gestor_id = p_new_manager_id, updated_at = now()
      WHERE gestor_id = p_person_id AND ativo = true
      RETURNING 1
    ) SELECT COUNT(*) INTO v_subordinates FROM upd;

    WITH upd AS (
      UPDATE pending_people SET gestor_id = p_new_manager_id
      WHERE status = 'PENDENTE' AND gestor_id = p_person_id
      RETURNING 1
    ) SELECT COUNT(*) INTO v_pending_people FROM upd;
  END IF;

  UPDATE people SET gestor_id = NULL WHERE gestor_id = p_person_id;

  DELETE FROM people WHERE id = p_person_id;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES ('people', p_person_id, 'HARD_DELETE_PERSON', caller_person_id,
    jsonb_build_object(
      'deleted_person', jsonb_build_object('id', v_target.id, 'nome', v_target.nome, 'email', v_target.email),
      'justification', p_justification,
      'new_manager_id', p_new_manager_id,
      'counts', jsonb_build_object('subordinates', v_subordinates, 'pending_people', v_pending_people)
    ));

  RETURN jsonb_build_object('success', true, 'message', 'Colaborador excluído definitivamente',
    'counts', jsonb_build_object('subordinates', v_subordinates, 'pending_people', v_pending_people));
END;
$function$;

REVOKE ALL ON FUNCTION public.deactivate_person(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_person_permanently(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_person(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_person_permanently(text, text, text) TO authenticated;
