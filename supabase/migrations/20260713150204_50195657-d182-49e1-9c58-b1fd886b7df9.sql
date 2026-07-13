
-- 1. Table
CREATE TABLE public.payment_day_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  current_day integer,
  requested_day integer NOT NULL CHECK (requested_day IN (10, 20, 30)),
  justification text,
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','APROVADO','REJEITADO','CANCELADO')),
  reviewed_by text REFERENCES public.people(id),
  reviewed_at timestamptz,
  review_notes text,
  effective_from date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payment_day_change_requests_one_pending_per_person
  ON public.payment_day_change_requests (person_id)
  WHERE status = 'PENDENTE';

CREATE INDEX payment_day_change_requests_person_idx
  ON public.payment_day_change_requests (person_id, created_at DESC);

-- 2. GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_day_change_requests TO authenticated;
GRANT ALL ON public.payment_day_change_requests TO service_role;

-- 3. RLS
ALTER TABLE public.payment_day_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Colaborador vê suas próprias solicitações"
  ON public.payment_day_change_requests FOR SELECT TO authenticated
  USING (person_id = public.current_person_id() OR public.is_admin_or_director());

CREATE POLICY "Admin/diretor gerencia todas"
  ON public.payment_day_change_requests FOR ALL TO authenticated
  USING (public.is_admin_or_director())
  WITH CHECK (public.is_admin_or_director());

-- 4. updated_at trigger
CREATE TRIGGER trg_payment_day_change_requests_updated_at
  BEFORE UPDATE ON public.payment_day_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RPCs
CREATE OR REPLACE FUNCTION public.request_payment_day_change(
  p_requested_day integer,
  p_justification text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_id text;
  v_current_day integer;
  v_modelo text;
  v_new_id uuid;
BEGIN
  v_person_id := public.current_person_id();
  IF v_person_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF p_requested_day NOT IN (10, 20, 30) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Dia inválido (use 10, 20 ou 30)');
  END IF;

  SELECT modelo_contrato, dia_pagamento INTO v_modelo, v_current_day
  FROM people WHERE id = v_person_id;

  IF v_modelo IS DISTINCT FROM 'PJ' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Alteração de dia de pagamento é apenas para contratos PJ');
  END IF;

  IF v_current_day = p_requested_day THEN
    RETURN jsonb_build_object('success', false, 'message', 'O dia solicitado é igual ao atual');
  END IF;

  IF EXISTS (SELECT 1 FROM payment_day_change_requests WHERE person_id = v_person_id AND status = 'PENDENTE') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Já existe uma solicitação pendente. Cancele-a antes de criar uma nova.');
  END IF;

  INSERT INTO payment_day_change_requests (person_id, current_day, requested_day, justification)
  VALUES (v_person_id, v_current_day, p_requested_day, NULLIF(trim(p_justification), ''))
  RETURNING id INTO v_new_id;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES ('payment_day_change_requests', v_new_id::text, 'PAYMENT_DAY_CHANGE_REQUESTED', v_person_id,
    jsonb_build_object('current_day', v_current_day, 'requested_day', p_requested_day, 'justification', p_justification));

  RETURN jsonb_build_object('success', true, 'request_id', v_new_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_payment_day_change(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_id text;
  v_row payment_day_change_requests%ROWTYPE;
BEGIN
  v_person_id := public.current_person_id();
  SELECT * INTO v_row FROM payment_day_change_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Solicitação não encontrada');
  END IF;
  IF v_row.person_id <> v_person_id AND NOT public.is_admin_or_director() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão');
  END IF;
  IF v_row.status <> 'PENDENTE' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Solicitação não está pendente');
  END IF;

  UPDATE payment_day_change_requests
  SET status = 'CANCELADO', reviewed_at = now(), reviewed_by = v_person_id
  WHERE id = p_request_id;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES ('payment_day_change_requests', p_request_id::text, 'PAYMENT_DAY_CHANGE_CANCELLED', v_person_id, '{}'::jsonb);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_payment_day_change(
  p_request_id uuid,
  p_approve boolean,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reviewer text;
  v_row payment_day_change_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin_or_director() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso negado');
  END IF;
  v_reviewer := public.current_person_id();

  SELECT * INTO v_row FROM payment_day_change_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Solicitação não encontrada');
  END IF;
  IF v_row.status <> 'PENDENTE' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Solicitação já foi processada');
  END IF;

  IF p_approve THEN
    UPDATE people SET dia_pagamento = v_row.requested_day, updated_at = now() WHERE id = v_row.person_id;
    UPDATE payment_day_change_requests
    SET status = 'APROVADO', reviewed_by = v_reviewer, reviewed_at = now(),
        review_notes = NULLIF(trim(p_notes), ''), effective_from = COALESCE(effective_from, CURRENT_DATE)
    WHERE id = p_request_id;
    INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
    VALUES ('payment_day_change_requests', p_request_id::text, 'PAYMENT_DAY_CHANGE_APPROVED', v_reviewer,
      jsonb_build_object('person_id', v_row.person_id, 'old_day', v_row.current_day, 'new_day', v_row.requested_day, 'notes', p_notes));
  ELSE
    UPDATE payment_day_change_requests
    SET status = 'REJEITADO', reviewed_by = v_reviewer, reviewed_at = now(), review_notes = NULLIF(trim(p_notes), '')
    WHERE id = p_request_id;
    INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
    VALUES ('payment_day_change_requests', p_request_id::text, 'PAYMENT_DAY_CHANGE_REJECTED', v_reviewer,
      jsonb_build_object('person_id', v_row.person_id, 'requested_day', v_row.requested_day, 'notes', p_notes));
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
