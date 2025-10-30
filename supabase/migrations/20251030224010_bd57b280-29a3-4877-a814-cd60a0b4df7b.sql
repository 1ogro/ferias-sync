-- Create pending_people table for employee registration approval workflow
CREATE TABLE IF NOT EXISTS pending_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NOT NULL,
  cargo text,
  local text,
  sub_time text,
  papel text NOT NULL DEFAULT 'COLABORADOR',
  gestor_id text NOT NULL,
  data_contrato date,
  data_nascimento date,
  modelo_contrato text DEFAULT 'CLT',
  
  -- Control fields
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'APROVADO', 'REJEITADO')),
  created_by text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamp with time zone,
  rejection_reason text,
  director_notes text
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pending_people_status ON pending_people(status);
CREATE INDEX IF NOT EXISTS idx_pending_people_gestor ON pending_people(gestor_id);
CREATE INDEX IF NOT EXISTS idx_pending_people_created_by ON pending_people(created_by);

-- Enable RLS
ALTER TABLE pending_people ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Gestores podem criar cadastros pendentes"
ON pending_people FOR INSERT
WITH CHECK (
  created_by IN (
    SELECT person_id FROM profiles WHERE user_id = auth.uid()
  ) AND
  created_by IN (
    SELECT id FROM people WHERE papel = 'GESTOR'
  )
);

CREATE POLICY "Gestores veem seus cadastros"
ON pending_people FOR SELECT
USING (
  created_by IN (
    SELECT person_id FROM profiles WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Diretores veem todos cadastros pendentes"
ON pending_people FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles prof
    JOIN people per ON prof.person_id = per.id
    WHERE prof.user_id = auth.uid() 
    AND (per.papel IN ('DIRETOR', 'ADMIN') OR per.is_admin = true)
  )
);

CREATE POLICY "Diretores podem editar cadastros pendentes"
ON pending_people FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles prof
    JOIN people per ON prof.person_id = per.id
    WHERE prof.user_id = auth.uid() 
    AND (per.papel IN ('DIRETOR', 'ADMIN') OR per.is_admin = true)
  )
);

-- Function to approve pending person
CREATE OR REPLACE FUNCTION approve_pending_person(
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
  p_data_nascimento date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_pending_record pending_people%ROWTYPE;
  v_new_person_id text;
  v_result jsonb;
BEGIN
  -- Fetch pending record
  SELECT * INTO v_pending_record
  FROM pending_people
  WHERE id = p_pending_id AND status = 'PENDENTE';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Cadastro pendente não encontrado'
    );
  END IF;
  
  -- Check if email already exists
  IF EXISTS (SELECT 1 FROM people WHERE email = COALESCE(p_email, v_pending_record.email)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Email já cadastrado no sistema'
    );
  END IF;
  
  -- Generate unique ID for new person
  v_new_person_id := 'pessoa_' || LPAD((
    SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM 8) AS INTEGER)), 0) + 1
    FROM people
    WHERE id LIKE 'pessoa_%'
  )::text, 3, '0');
  
  -- Insert into people table with edited or original data
  INSERT INTO people (
    id, nome, email, cargo, local, sub_time,
    papel, gestor_id, data_contrato, data_nascimento,
    modelo_contrato, ativo, is_admin
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
    false
  );
  
  -- Update pending status
  UPDATE pending_people
  SET 
    status = 'APROVADO',
    reviewed_by = p_reviewer_id,
    reviewed_at = now(),
    director_notes = p_director_notes
  WHERE id = p_pending_id;
  
  -- Audit log
  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES (
    'pending_people',
    p_pending_id::text,
    'APPROVE_PERSON',
    p_reviewer_id,
    jsonb_build_object(
      'new_person_id', v_new_person_id,
      'director_notes', p_director_notes
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'person_id', v_new_person_id,
    'message', 'Colaborador aprovado e cadastrado com sucesso'
  );
END;
$$;

-- Function to reject pending person
CREATE OR REPLACE FUNCTION reject_pending_person(
  p_pending_id uuid,
  p_reviewer_id text,
  p_rejection_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE pending_people
  SET 
    status = 'REJEITADO',
    reviewed_by = p_reviewer_id,
    reviewed_at = now(),
    rejection_reason = p_rejection_reason
  WHERE id = p_pending_id AND status = 'PENDENTE';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Cadastro pendente não encontrado'
    );
  END IF;
  
  -- Audit log
  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES (
    'pending_people',
    p_pending_id::text,
    'REJECT_PERSON',
    p_reviewer_id,
    jsonb_build_object('reason', p_rejection_reason)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Cadastro rejeitado'
  );
END;
$$;