
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

  IF NOT (
    caller_is_admin = true
    OR caller_papel IN ('DIRETOR', 'ADMIN')
    OR public.is_team_final_approver_of_person(p_person_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para editar diretamente. Envie uma solicitação de alteração.');
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

REVOKE EXECUTE ON FUNCTION public.request_data_change(text, jsonb, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.review_data_change(uuid, boolean, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cancel_data_change(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_own_birthdate(date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_review_data_change(text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.request_data_change(text, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_data_change(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_data_change(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_own_birthdate(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_data_change(text) TO authenticated;
