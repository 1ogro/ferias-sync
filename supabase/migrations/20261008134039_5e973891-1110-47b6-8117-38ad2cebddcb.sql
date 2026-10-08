CREATE TABLE public.offboarding_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  requested_by text NOT NULL REFERENCES public.people(id),
  reason text NOT NULL,
  last_day date,
  new_manager_id text REFERENCES public.people(id),
  status text NOT NULL DEFAULT 'PENDENTE_DIRETOR',
  director_id text REFERENCES public.people(id),
  director_notes text,
  director_at timestamptz,
  admin_id text REFERENCES public.people(id),
  admin_notes text,
  admin_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.offboarding_requests TO authenticated;
GRANT ALL ON public.offboarding_requests TO service_role;
ALTER TABLE public.offboarding_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offboarding visible to leadership in scope" ON public.offboarding_requests
FOR SELECT TO authenticated
USING (public.is_admin_or_director() OR requested_by = public.current_person_id() OR public.is_in_my_manager_scope(person_id));
CREATE TRIGGER trg_offboarding_updated BEFORE UPDATE ON public.offboarding_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE UNIQUE INDEX uq_offboarding_open ON public.offboarding_requests(person_id)
  WHERE status IN ('PENDENTE_DIRETOR','PENDENTE_ADMIN');

CREATE OR REPLACE FUNCTION public.request_offboarding(p_person_id text, p_reason text, p_last_day date DEFAULT NULL, p_new_manager_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me people%ROWTYPE; v_target people%ROWTYPE; v_id uuid; v_status text;
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
  v_status := CASE WHEN v_me.papel IN ('DIRETOR','ADMIN') OR v_me.is_admin THEN 'PENDENTE_ADMIN' ELSE 'PENDENTE_DIRETOR' END;
  INSERT INTO offboarding_requests(person_id, requested_by, reason, last_day, new_manager_id, status, director_id, director_at)
  VALUES (p_person_id, v_me.id, trim(p_reason), p_last_day, p_new_manager_id, v_status,
    CASE WHEN v_status='PENDENTE_ADMIN' THEN v_me.id END, CASE WHEN v_status='PENDENTE_ADMIN' THEN now() END)
  RETURNING id INTO v_id;
  INSERT INTO audit_logs(entidade, entidade_id, acao, actor_id, payload)
  VALUES ('offboarding_requests', v_id::text, 'CREATE', v_me.id, jsonb_build_object('person_id',p_person_id,'reason',p_reason,'status',v_status));
  RETURN jsonb_build_object('success',true,'id',v_id,'status',v_status);
END $$;

CREATE OR REPLACE FUNCTION public.review_offboarding(p_request_id uuid, p_approve boolean, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me people%ROWTYPE; v_req offboarding_requests%ROWTYPE; v_res jsonb;
BEGIN
  SELECT p.* INTO v_me FROM people p WHERE p.id = current_person_id();
  SELECT * INTO v_req FROM offboarding_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL THEN RETURN jsonb_build_object('success',false,'message','Solicitação não encontrada'); END IF;
  IF NOT p_approve AND length(trim(coalesce(p_notes,''))) < 5 THEN
    RETURN jsonb_build_object('success',false,'message','Explique o motivo da recusa (mínimo 5 caracteres)');
  END IF;
  IF v_req.status = 'PENDENTE_DIRETOR' THEN
    IF NOT (v_me.papel IN ('DIRETOR','ADMIN') OR v_me.is_admin) THEN RETURN jsonb_build_object('success',false,'message','Apenas diretoria pode aprovar esta etapa'); END IF;
    UPDATE offboarding_requests SET status = CASE WHEN p_approve THEN 'PENDENTE_ADMIN' ELSE 'REJEITADO' END,
      director_id = v_me.id, director_notes = p_notes, director_at = now() WHERE id = p_request_id;
  ELSIF v_req.status = 'PENDENTE_ADMIN' THEN
    IF NOT (v_me.is_admin OR v_me.papel = 'ADMIN') THEN RETURN jsonb_build_object('success',false,'message','Apenas administradores confirmam o desligamento'); END IF;
    IF p_approve THEN
      v_res := deactivate_person(v_req.person_id, 'Desligamento: ' || v_req.reason, v_req.new_manager_id);
      IF NOT coalesce((v_res->>'success')::boolean,false) THEN RETURN v_res; END IF;
    END IF;
    UPDATE offboarding_requests SET status = CASE WHEN p_approve THEN 'CONCLUIDO' ELSE 'REJEITADO' END,
      admin_id = v_me.id, admin_notes = p_notes, admin_at = now() WHERE id = p_request_id;
  ELSE
    RETURN jsonb_build_object('success',false,'message','Esta solicitação já foi finalizada');
  END IF;
  INSERT INTO audit_logs(entidade, entidade_id, acao, actor_id, payload)
  VALUES ('offboarding_requests', p_request_id::text, CASE WHEN p_approve THEN 'APPROVE' ELSE 'REJECT' END, v_me.id,
    jsonb_build_object('stage', v_req.status, 'notes', p_notes));
  RETURN jsonb_build_object('success',true);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_offboarding(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me text := current_person_id(); v_req offboarding_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM offboarding_requests WHERE id = p_request_id;
  IF v_req.id IS NULL OR v_req.status NOT IN ('PENDENTE_DIRETOR','PENDENTE_ADMIN') THEN RETURN jsonb_build_object('success',false,'message','Solicitação não pode ser cancelada'); END IF;
  IF v_req.requested_by <> v_me AND NOT is_admin_or_director() THEN RETURN jsonb_build_object('success',false,'message','Sem permissão'); END IF;
  UPDATE offboarding_requests SET status='CANCELADO' WHERE id = p_request_id;
  INSERT INTO audit_logs(entidade, entidade_id, acao, actor_id, payload) VALUES ('offboarding_requests', p_request_id::text, 'CANCEL', v_me, '{}'::jsonb);
  RETURN jsonb_build_object('success',true);
END $$;

REVOKE ALL ON FUNCTION public.request_offboarding(text,text,date,text), public.review_offboarding(uuid,boolean,text), public.cancel_offboarding(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_offboarding(text,text,date,text), public.review_offboarding(uuid,boolean,text), public.cancel_offboarding(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_people_in_my_feedback_scope();
CREATE FUNCTION public.get_people_in_my_feedback_scope()
RETURNS TABLE(id text, nome text, sub_time text, cargo text, ativo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nome, p.sub_time, p.cargo, COALESCE(p.ativo, true)
  FROM public.people p
  WHERE public.can_manage_person_feedback(p.id)
  ORDER BY COALESCE(p.ativo, true) DESC, p.nome;
$$;
REVOKE ALL ON FUNCTION public.get_people_in_my_feedback_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_people_in_my_feedback_scope() TO authenticated;