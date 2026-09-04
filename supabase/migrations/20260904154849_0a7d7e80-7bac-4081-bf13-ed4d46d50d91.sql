CREATE OR REPLACE FUNCTION public.has_direct_reports(_person_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM people p WHERE p.gestor_id = _person_id AND p.ativo = true
  ) OR EXISTS (
    SELECT 1 FROM people me
    WHERE me.id = _person_id AND me.papel = 'GERENTE' AND me.sub_time IS NOT NULL
      AND EXISTS (SELECT 1 FROM people t WHERE t.sub_time = me.sub_time AND t.ativo = true AND t.id <> me.id)
  );
$$;

REVOKE ALL ON FUNCTION public.has_direct_reports(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_direct_reports(text) TO authenticated, service_role;

-- Trigger: bloqueia auto-desligamento dos lembretes de feedback por quem tem liderados
CREATE OR REPLACE FUNCTION public.guard_feedback_reminder_optout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller text;
BEGIN
  IF current_setting('app.allow_feedback_optout', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF (OLD.feedback_reminders_slack = true AND NEW.feedback_reminders_slack = false)
     OR (OLD.feedback_reminders_email = true AND NEW.feedback_reminders_email = false) THEN
    SELECT person_id INTO v_caller FROM profiles WHERE user_id = auth.uid();
    IF v_caller IS NOT NULL AND v_caller = NEW.person_id
       AND public.has_direct_reports(NEW.person_id)
       AND NOT public.is_admin_or_director() THEN
      RAISE EXCEPTION 'Desligar a cobrança de coleta de feedback exige aprovação do gerente ou da diretoria';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_feedback_reminder_optout ON public.notification_preferences;
CREATE TRIGGER trg_guard_feedback_reminder_optout
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.guard_feedback_reminder_optout();

-- Também no INSERT (upsert do frontend pode inserir já desligado)
CREATE OR REPLACE FUNCTION public.guard_feedback_reminder_optout_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller text;
BEGIN
  IF current_setting('app.allow_feedback_optout', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.feedback_reminders_slack = false OR NEW.feedback_reminders_email = false THEN
    SELECT person_id INTO v_caller FROM profiles WHERE user_id = auth.uid();
    IF v_caller IS NOT NULL AND v_caller = NEW.person_id
       AND public.has_direct_reports(NEW.person_id)
       AND NOT public.is_admin_or_director() THEN
      NEW.feedback_reminders_slack := true;
      NEW.feedback_reminders_email := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_feedback_reminder_optout_ins ON public.notification_preferences;
CREATE TRIGGER trg_guard_feedback_reminder_optout_ins
BEFORE INSERT ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.guard_feedback_reminder_optout_ins();

-- request_data_change: aceita o novo tipo
CREATE OR REPLACE FUNCTION public.request_data_change(p_person_id text, p_changes jsonb, p_justification text DEFAULT NULL::text, p_kind text DEFAULT 'PROFILE_DATA'::text)
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

  IF p_kind NOT IN ('PROFILE_DATA', 'VACATION_HISTORICAL', 'FEEDBACK_REMINDER_OPTOUT') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Tipo de solicitação inválido');
  END IF;

  IF p_changes IS NULL OR p_changes = '{}'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nenhuma alteração informada');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM people WHERE id = p_person_id AND ativo = true) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Colaborador não encontrado ou inativo');
  END IF;

  IF p_kind = 'FEEDBACK_REMINDER_OPTOUT' AND v_caller <> p_person_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Só é possível solicitar o desligamento dos próprios lembretes');
  END IF;

  SELECT gestor_id INTO v_gestor FROM people WHERE id = p_person_id;

  IF NOT (v_caller = p_person_id OR v_caller = v_gestor) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para solicitar alteração deste colaborador');
  END IF;

  IF EXISTS (
    SELECT 1 FROM data_change_requests
    WHERE person_id = p_person_id AND status = 'PENDENTE' AND kind = p_kind
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Já existe uma solicitação pendente deste tipo');
  END IF;

  IF p_kind <> 'FEEDBACK_REMINDER_OPTOUT' AND EXISTS (
    SELECT 1 FROM data_change_requests
    WHERE person_id = p_person_id AND status = 'PENDENTE' AND kind <> 'FEEDBACK_REMINDER_OPTOUT'
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

-- review_data_change: aplica o desligamento aprovado
CREATE OR REPLACE FUNCTION public.review_data_change(p_request_id uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
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

  IF v_req.kind = 'FEEDBACK_REMINDER_OPTOUT' THEN
    PERFORM set_config('app.allow_feedback_optout', 'on', true);
    INSERT INTO notification_preferences (person_id, feedback_reminders_slack, feedback_reminders_email)
    VALUES (
      v_req.person_id,
      COALESCE((v_c->>'feedback_reminders_slack')::boolean, true),
      COALESCE((v_c->>'feedback_reminders_email')::boolean, true)
    )
    ON CONFLICT (person_id) DO UPDATE SET
      feedback_reminders_slack = CASE WHEN v_c ? 'feedback_reminders_slack'
        THEN (v_c->>'feedback_reminders_slack')::boolean ELSE notification_preferences.feedback_reminders_slack END,
      feedback_reminders_email = CASE WHEN v_c ? 'feedback_reminders_email'
        THEN (v_c->>'feedback_reminders_email')::boolean ELSE notification_preferences.feedback_reminders_email END,
      updated_at = now();
    PERFORM set_config('app.allow_feedback_optout', 'off', true);
  ELSIF v_req.kind = 'PROFILE_DATA' THEN
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