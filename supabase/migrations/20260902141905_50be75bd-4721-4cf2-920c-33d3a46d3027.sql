
-- 1) Table
CREATE TABLE public.data_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  requested_by text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'PROFILE_DATA',
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  justification text,
  status text NOT NULL DEFAULT 'PENDENTE',
  reviewed_by text REFERENCES public.people(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dcr_person ON public.data_change_requests(person_id);
CREATE INDEX idx_dcr_status ON public.data_change_requests(status);

GRANT SELECT ON public.data_change_requests TO authenticated;
GRANT ALL ON public.data_change_requests TO service_role;

ALTER TABLE public.data_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or requested data change requests"
ON public.data_change_requests FOR SELECT TO authenticated
USING (
  person_id = public.current_person_id()
  OR requested_by = public.current_person_id()
  OR public.is_admin_or_director()
  OR public.is_team_final_approver_of_person(person_id)
);

CREATE TRIGGER trg_dcr_updated_at
BEFORE UPDATE ON public.data_change_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Allow sub-team gerente on onboarding data update + allow explicit clearing
CREATE OR REPLACE FUNCTION public.update_collaborator_onboarding_data(
  p_person_id text,
  p_data_contrato date DEFAULT NULL::date,
  p_modelo_contrato text DEFAULT NULL::text,
  p_dia_pagamento integer DEFAULT NULL::integer,
  p_data_nascimento date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_person_id text;
  caller_papel text;
  caller_is_admin boolean;
  target_gestor_id text;
  old_data jsonb;
BEGIN
  SELECT prof.person_id, per.papel, per.is_admin
  INTO caller_person_id, caller_papel, caller_is_admin
  FROM profiles prof
  JOIN people per ON prof.person_id = per.id
  WHERE prof.user_id = auth.uid();

  IF caller_person_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não encontrado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM people WHERE id = p_person_id AND ativo = true) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Colaborador não encontrado ou inativo');
  END IF;

  SELECT gestor_id INTO target_gestor_id FROM people WHERE id = p_person_id;

  IF NOT (
    caller_is_admin = true
    OR caller_papel IN ('DIRETOR', 'ADMIN')
    OR caller_person_id = target_gestor_id
    OR public.is_team_final_approver_of_person(p_person_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para editar este colaborador');
  END IF;

  SELECT to_jsonb(p.*) INTO old_data FROM people p WHERE id = p_person_id;

  UPDATE people SET
    data_contrato = COALESCE(p_data_contrato, data_contrato),
    modelo_contrato = COALESCE(p_modelo_contrato, modelo_contrato),
    dia_pagamento = COALESCE(p_dia_pagamento, dia_pagamento),
    data_nascimento = COALESCE(p_data_nascimento, data_nascimento),
    updated_at = now()
  WHERE id = p_person_id;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES ('people', p_person_id, 'UPDATE_ONBOARDING', caller_person_id,
    jsonb_build_object('old', old_data, 'changes', jsonb_build_object(
      'data_contrato', p_data_contrato,
      'modelo_contrato', p_modelo_contrato,
      'dia_pagamento', p_dia_pagamento,
      'data_nascimento', p_data_nascimento
    )));

  RETURN jsonb_build_object('success', true, 'message', 'Dados atualizados com sucesso');
END;
$function$;

-- 3) Self-service birthdate update
CREATE OR REPLACE FUNCTION public.update_own_birthdate(p_data_nascimento date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_person_id text;
  v_old date;
BEGIN
  SELECT person_id INTO v_person_id FROM profiles WHERE user_id = auth.uid();
  IF v_person_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil não encontrado');
  END IF;

  SELECT data_nascimento INTO v_old FROM people WHERE id = v_person_id;

  UPDATE people SET data_nascimento = p_data_nascimento, updated_at = now()
  WHERE id = v_person_id;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES ('people', v_person_id, 'UPDATE_BIRTHDATE', v_person_id,
    jsonb_build_object('old', v_old, 'new', p_data_nascimento));

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 4) Who approves a given person's data change
CREATE OR REPLACE FUNCTION public.can_review_data_change(_person_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.is_admin_or_director() OR public.is_team_final_approver_of_person(_person_id);
$function$;

-- 5) Request a data change
CREATE OR REPLACE FUNCTION public.request_data_change(
  p_person_id text,
  p_changes jsonb,
  p_justification text DEFAULT NULL,
  p_kind text DEFAULT 'PROFILE_DATA'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller text;
  v_gestor text;
  v_id uuid;
BEGIN
  SELECT person_id INTO v_caller FROM profiles WHERE user_id = auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil não encontrado');
  END IF;

  IF p_kind NOT IN ('PROFILE_DATA', 'VACATION_HISTORICAL') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Tipo de solicitação inválido');
  END IF;

  IF p_changes IS NULL OR p_changes = '{}'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nenhuma alteração informada');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM people WHERE id = p_person_id AND ativo = true) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Colaborador não encontrado ou inativo');
  END IF;

  SELECT gestor_id INTO v_gestor FROM people WHERE id = p_person_id;

  IF NOT (v_caller = p_person_id OR v_caller = v_gestor) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para solicitar alteração deste colaborador');
  END IF;

  IF EXISTS (
    SELECT 1 FROM data_change_requests
    WHERE person_id = p_person_id AND status = 'PENDENTE'
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Já existe uma solicitação pendente para este colaborador');
  END IF;

  INSERT INTO data_change_requests (person_id, requested_by, kind, changes, justification)
  VALUES (p_person_id, v_caller, p_kind, p_changes, NULLIF(trim(coalesce(p_justification,'')), ''))
  RETURNING id INTO v_id;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES ('data_change_requests', v_id::text, 'CREATE', v_caller,
    jsonb_build_object('person_id', p_person_id, 'kind', p_kind, 'changes', p_changes));

  RETURN jsonb_build_object('success', true, 'request_id', v_id);
END;
$function$;

-- 6) Cancel
CREATE OR REPLACE FUNCTION public.cancel_data_change(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller text;
  v_req data_change_requests%ROWTYPE;
BEGIN
  SELECT person_id INTO v_caller FROM profiles WHERE user_id = auth.uid();
  SELECT * INTO v_req FROM data_change_requests WHERE id = p_request_id;

  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Solicitação não encontrada');
  END IF;
  IF v_req.status <> 'PENDENTE' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Solicitação já foi processada');
  END IF;
  IF NOT (v_caller = v_req.requested_by OR public.can_review_data_change(v_req.person_id)) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão');
  END IF;

  UPDATE data_change_requests SET status = 'CANCELADO', updated_at = now() WHERE id = p_request_id;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES ('data_change_requests', p_request_id::text, 'CANCEL', v_caller, '{}'::jsonb);

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 7) Review (approve/reject) and apply
CREATE OR REPLACE FUNCTION public.review_data_change(
  p_request_id uuid,
  p_approve boolean,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller text;
  v_req data_change_requests%ROWTYPE;
  v_c jsonb;
  v_new_request_id uuid;
BEGIN
  SELECT person_id INTO v_caller FROM profiles WHERE user_id = auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil não encontrado');
  END IF;

  SELECT * INTO v_req FROM data_change_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Solicitação não encontrada');
  END IF;
  IF v_req.status <> 'PENDENTE' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Solicitação já foi processada');
  END IF;
  IF NOT public.can_review_data_change(v_req.person_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para revisar esta solicitação');
  END IF;

  IF NOT p_approve THEN
    UPDATE data_change_requests
    SET status = 'REPROVADO', reviewed_by = v_caller, reviewed_at = now(),
        review_notes = p_notes, updated_at = now()
    WHERE id = p_request_id;

    INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
    VALUES ('data_change_requests', p_request_id::text, 'REJECT', v_caller,
      jsonb_build_object('notes', p_notes));

    RETURN jsonb_build_object('success', true, 'status', 'REPROVADO');
  END IF;

  v_c := v_req.changes;

  IF v_req.kind = 'PROFILE_DATA' THEN
    UPDATE people SET
      data_contrato = CASE WHEN v_c ? 'data_contrato' THEN NULLIF(v_c->>'data_contrato','')::date ELSE data_contrato END,
      modelo_contrato = CASE WHEN v_c ? 'modelo_contrato' THEN NULLIF(v_c->>'modelo_contrato','') ELSE modelo_contrato END,
      cargo = CASE WHEN v_c ? 'cargo' THEN NULLIF(v_c->>'cargo','') ELSE cargo END,
      sub_time = CASE WHEN v_c ? 'sub_time' THEN NULLIF(v_c->>'sub_time','') ELSE sub_time END,
      local = CASE WHEN v_c ? 'local' THEN NULLIF(v_c->>'local','') ELSE local END,
      data_nascimento = CASE WHEN v_c ? 'data_nascimento' THEN NULLIF(v_c->>'data_nascimento','')::date ELSE data_nascimento END,
      dia_pagamento = CASE WHEN v_c ? 'dia_pagamento' THEN NULLIF(v_c->>'dia_pagamento','')::int ELSE dia_pagamento END,
      updated_at = now()
    WHERE id = v_req.person_id;
  ELSE
    INSERT INTO requests (
      requester_id, tipo, inicio, fim, tipo_ferias, status, justificativa,
      is_historical, original_created_at, original_channel
    )
    VALUES (
      v_req.person_id,
      COALESCE(NULLIF(v_c->>'tipo',''), 'FERIAS'),
      NULLIF(v_c->>'inicio','')::date,
      NULLIF(v_c->>'fim','')::date,
      NULLIF(v_c->>'tipo_ferias',''),
      'APROVADO_FINAL',
      COALESCE(v_req.justification, 'Regularização histórica'),
      true,
      now(),
      'REGULARIZACAO'
    )
    RETURNING id INTO v_new_request_id;
  END IF;

  UPDATE data_change_requests
  SET status = 'APROVADO', reviewed_by = v_caller, reviewed_at = now(),
      review_notes = p_notes, updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES ('data_change_requests', p_request_id::text, 'APPROVE', v_caller,
    jsonb_build_object('person_id', v_req.person_id, 'kind', v_req.kind, 'changes', v_c, 'created_request_id', v_new_request_id));

  RETURN jsonb_build_object('success', true, 'status', 'APROVADO', 'created_request_id', v_new_request_id);
END;
$function$;

-- 8) Allow sub-team gerente to create historical requests for their team
CREATE POLICY "Team gerente can create requests for team"
ON public.requests FOR INSERT TO authenticated
WITH CHECK (public.is_team_final_approver_of_person(requester_id));
