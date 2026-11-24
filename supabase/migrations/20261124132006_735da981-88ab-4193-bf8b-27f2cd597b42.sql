UPDATE public.offboarding_requests SET status='PENDENTE_DIRETOR' WHERE status='PENDENTE_ADMIN';

CREATE OR REPLACE FUNCTION public.request_offboarding(p_person_id text, p_reason text, p_last_day date DEFAULT NULL, p_new_manager_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me people%ROWTYPE; v_target people%ROWTYPE; v_id uuid; v_res jsonb; v_is_dir boolean;
BEGIN
  SELECT p.* INTO v_me FROM people p WHERE p.id = current_person_id();
  IF v_me.id IS NULL THEN RETURN jsonb_build_object('success',false,'message','Não autenticado'); END IF;
  SELECT * INTO v_target FROM people WHERE id = p_person_id;
  IF v_target.id IS NULL OR v_target.ativo = false THEN RETURN jsonb_build_object('success',false,'message','Pessoa não encontrada ou já inativa'); END IF;
  IF v_target.id = v_me.id THEN RETURN jsonb_build_object('success',false,'message','Você não pode solicitar o próprio desligamento'); END IF;
  IF NOT (v_me.papel IN ('GESTOR','GERENTE','DIRETOR','ADMIN') OR v_me.is_admin) OR NOT is_in_my_manager_scope(p_person_id) THEN
    RETURN jsonb_build_object('success',false,'message','Sem permissão para solicitar o desligamento desta pessoa');
  END IF;
  IF length(trim(coalesce(p_reason,''))) < 5 THEN RETURN jsonb_build_object('success',false,'message','Informe o motivo (mínimo 5 caracteres)'); END IF;
  IF EXISTS (SELECT 1 FROM offboarding_requests WHERE person_id = p_person_id AND status IN ('PENDENTE_DIRETOR','PENDENTE_ADMIN')) THEN
    RETURN jsonb_build_object('success',false,'message','Já existe um desligamento em andamento para esta pessoa');
  END IF;
  v_is_dir := v_me.papel IN ('DIRETOR','ADMIN') OR coalesce(v_me.is_admin,false);
  IF v_is_dir THEN
    v_res := deactivate_person(p_person_id, 'Desligamento: ' || trim(p_reason), p_new_manager_id);
    IF NOT coalesce((v_res->>'success')::boolean,false) THEN RETURN v_res; END IF;
  END IF;
  INSERT INTO offboarding_requests(person_id, requested_by, reason, last_day, new_manager_id, status, director_id, director_at)
  VALUES (p_person_id, v_me.id, trim(p_reason), p_last_day, p_new_manager_id,
    CASE WHEN v_is_dir THEN 'CONCLUIDO' ELSE 'PENDENTE_DIRETOR' END,
    CASE WHEN v_is_dir THEN v_me.id END, CASE WHEN v_is_dir THEN now() END)
  RETURNING id INTO v_id;
  INSERT INTO audit_logs(entidade, entidade_id, acao, actor_id, payload)
  VALUES ('offboarding_requests', v_id::text, 'CREATE', v_me.id, jsonb_build_object('person_id',p_person_id,'reason',p_reason,'direct',v_is_dir));
  RETURN jsonb_build_object('success',true,'id',v_id,'status',CASE WHEN v_is_dir THEN 'CONCLUIDO' ELSE 'PENDENTE_DIRETOR' END);
END $$;

CREATE OR REPLACE FUNCTION public.review_offboarding(p_request_id uuid, p_approve boolean, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me people%ROWTYPE; v_req offboarding_requests%ROWTYPE; v_res jsonb;
BEGIN
  SELECT p.* INTO v_me FROM people p WHERE p.id = current_person_id();
  SELECT * INTO v_req FROM offboarding_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN RETURN jsonb_build_object('success',false,'message','Solicitação não encontrada'); END IF;
  IF v_req.status NOT IN ('PENDENTE_DIRETOR','PENDENTE_ADMIN') THEN RETURN jsonb_build_object('success',false,'message','Esta solicitação já foi finalizada'); END IF;
  IF NOT (v_me.papel IN ('DIRETOR','ADMIN') OR coalesce(v_me.is_admin,false)) THEN
    RETURN jsonb_build_object('success',false,'message','Apenas a diretoria avalia e confirma desligamentos');
  END IF;
  IF NOT p_approve AND length(trim(coalesce(p_notes,''))) < 5 THEN
    RETURN jsonb_build_object('success',false,'message','Explique o motivo da recusa (mínimo 5 caracteres)');
  END IF;
  IF p_approve THEN
    v_res := deactivate_person(v_req.person_id, 'Desligamento: ' || v_req.reason, v_req.new_manager_id);
    IF NOT coalesce((v_res->>'success')::boolean,false) THEN RETURN v_res; END IF;
  END IF;
  UPDATE offboarding_requests SET status = CASE WHEN p_approve THEN 'CONCLUIDO' ELSE 'REJEITADO' END,
    director_id = v_me.id, director_notes = p_notes, director_at = now() WHERE id = p_request_id;
  INSERT INTO audit_logs(entidade, entidade_id, acao, actor_id, payload)
  VALUES ('offboarding_requests', p_request_id::text, CASE WHEN p_approve THEN 'APPROVE' ELSE 'REJECT' END, v_me.id, jsonb_build_object('notes', p_notes));
  RETURN jsonb_build_object('success',true);
END $$;

REVOKE ALL ON FUNCTION public.request_offboarding(text,text,date,text), public.review_offboarding(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_offboarding(text,text,date,text), public.review_offboarding(uuid,boolean,text) TO authenticated;