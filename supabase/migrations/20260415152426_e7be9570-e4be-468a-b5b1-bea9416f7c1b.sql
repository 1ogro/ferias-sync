
-- 1. Drop the old overload (without p_dia_pagamento) to avoid ambiguity
DROP FUNCTION IF EXISTS public.approve_pending_person(uuid, text, text, text, text, text, text, text, text, date, text, date);

-- 2. Create RPC for managers/directors/admins to update onboarding data
CREATE OR REPLACE FUNCTION public.update_collaborator_onboarding_data(
  p_person_id text,
  p_data_contrato date DEFAULT NULL,
  p_modelo_contrato text DEFAULT NULL,
  p_dia_pagamento integer DEFAULT NULL,
  p_data_nascimento date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_person_id text;
  caller_papel text;
  caller_is_admin boolean;
  target_gestor_id text;
  old_data jsonb;
BEGIN
  -- Get caller identity
  SELECT prof.person_id, per.papel, per.is_admin
  INTO caller_person_id, caller_papel, caller_is_admin
  FROM profiles prof
  JOIN people per ON prof.person_id = per.id
  WHERE prof.user_id = auth.uid();

  IF caller_person_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não encontrado');
  END IF;

  -- Get target person's manager
  SELECT gestor_id INTO target_gestor_id
  FROM people
  WHERE id = p_person_id AND ativo = true;

  IF target_gestor_id IS NULL AND NOT EXISTS (SELECT 1 FROM people WHERE id = p_person_id AND ativo = true) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Colaborador não encontrado ou inativo');
  END IF;

  -- Authorization: admin, director, or direct manager
  IF NOT (
    caller_is_admin = true
    OR caller_papel IN ('DIRETOR', 'ADMIN')
    OR caller_person_id = target_gestor_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para editar este colaborador');
  END IF;

  -- Capture old data for audit
  SELECT to_jsonb(p.*) INTO old_data FROM people p WHERE id = p_person_id;

  -- Update only provided fields
  UPDATE people SET
    data_contrato = COALESCE(p_data_contrato, data_contrato),
    modelo_contrato = COALESCE(p_modelo_contrato, modelo_contrato),
    dia_pagamento = CASE
      WHEN p_dia_pagamento IS NOT NULL THEN p_dia_pagamento
      ELSE dia_pagamento
    END,
    data_nascimento = COALESCE(p_data_nascimento, data_nascimento),
    updated_at = now()
  WHERE id = p_person_id;

  -- Audit log
  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES (
    'people',
    p_person_id,
    'UPDATE_ONBOARDING',
    caller_person_id,
    jsonb_build_object(
      'old', old_data,
      'changes', jsonb_build_object(
        'data_contrato', p_data_contrato,
        'modelo_contrato', p_modelo_contrato,
        'dia_pagamento', p_dia_pagamento,
        'data_nascimento', p_data_nascimento
      )
    )
  );

  RETURN jsonb_build_object('success', true, 'message', 'Dados atualizados com sucesso');
END;
$$;
