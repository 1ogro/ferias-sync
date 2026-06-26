
CREATE OR REPLACE FUNCTION public.complete_own_profile(
  p_data_nascimento date,
  p_cargo text,
  p_sub_time text,
  p_local text,
  p_data_contrato date,
  p_modelo_contrato text,
  p_dia_pagamento integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_person_id text;
BEGIN
  SELECT person_id INTO v_person_id
  FROM profiles
  WHERE user_id = auth.uid();

  IF v_person_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil não encontrado');
  END IF;

  IF p_data_nascimento IS NULL OR p_cargo IS NULL OR p_sub_time IS NULL OR p_data_contrato IS NULL OR p_modelo_contrato IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Campos obrigatórios não preenchidos');
  END IF;

  UPDATE people
    SET data_nascimento = p_data_nascimento,
        cargo = p_cargo,
        sub_time = p_sub_time,
        local = NULLIF(p_local, ''),
        data_contrato = p_data_contrato,
        modelo_contrato = p_modelo_contrato,
        dia_pagamento = CASE WHEN p_modelo_contrato = 'PJ' THEN p_dia_pagamento ELSE NULL END,
        profile_completed_at = now(),
        updated_at = now()
    WHERE id = v_person_id;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES (
    'people',
    v_person_id,
    'COMPLETE_PROFILE',
    v_person_id,
    jsonb_build_object(
      'data_nascimento', p_data_nascimento,
      'cargo', p_cargo,
      'sub_time', p_sub_time,
      'local', p_local,
      'data_contrato', p_data_contrato,
      'modelo_contrato', p_modelo_contrato,
      'dia_pagamento', p_dia_pagamento
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;
