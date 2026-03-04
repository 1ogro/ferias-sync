
-- Add dia_pagamento to people table
ALTER TABLE public.people 
ADD COLUMN dia_pagamento integer DEFAULT NULL;

COMMENT ON COLUMN public.people.dia_pagamento IS 'Dia do mês para pagamento PJ (10, 20 ou 30)';

-- Add dia_pagamento to pending_people table
ALTER TABLE public.pending_people 
ADD COLUMN dia_pagamento integer DEFAULT NULL;

-- Update approve_pending_person to include dia_pagamento parameter
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
  p_dia_pagamento integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pending_record pending_people%ROWTYPE;
  v_new_person_id text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_pending_record
  FROM pending_people
  WHERE id = p_pending_id AND status = 'PENDENTE';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cadastro pendente não encontrado');
  END IF;
  
  IF EXISTS (SELECT 1 FROM people WHERE email = COALESCE(p_email, v_pending_record.email)) THEN
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
    modelo_contrato, ativo, is_admin, dia_pagamento
  ) VALUES (
    v_new_person_id,
    COALESCE(p_nome, v_pending_record.nome),
    COALESCE(p_email, v_pending_record.email),
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
    COALESCE(p_dia_pagamento, v_pending_record.dia_pagamento)
  );
  
  UPDATE pending_people
  SET 
    status = 'APROVADO',
    reviewed_by = p_reviewer_id,
    reviewed_at = now(),
    director_notes = p_director_notes
  WHERE id = p_pending_id;
  
  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES (
    'pending_people',
    p_pending_id::text,
    'APPROVE_PERSON',
    p_reviewer_id,
    jsonb_build_object('new_person_id', v_new_person_id, 'director_notes', p_director_notes)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'person_id', v_new_person_id,
    'message', 'Colaborador aprovado e cadastrado com sucesso'
  );
END;
$$;
