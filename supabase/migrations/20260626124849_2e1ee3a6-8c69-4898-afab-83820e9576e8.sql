
-- Add slack_user_id and profile_completed_at to people
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS slack_user_id text,
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

-- Backfill: existing users with full data are considered "completed"
UPDATE public.people
SET profile_completed_at = COALESCE(updated_at, created_at, now())
WHERE profile_completed_at IS NULL
  AND data_contrato IS NOT NULL
  AND data_nascimento IS NOT NULL;

-- RPC to mark profile as completed for current user
CREATE OR REPLACE FUNCTION public.mark_profile_completed()
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

  UPDATE people
    SET profile_completed_at = now(), updated_at = now()
    WHERE id = v_person_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Update approve_pending_person to also persist slack_user_id on people
CREATE OR REPLACE FUNCTION public.approve_pending_person(p_pending_id uuid, p_reviewer_id text, p_director_notes text DEFAULT NULL::text, p_nome text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_cargo text DEFAULT NULL::text, p_local text DEFAULT NULL::text, p_sub_time text DEFAULT NULL::text, p_gestor_id text DEFAULT NULL::text, p_data_contrato date DEFAULT NULL::date, p_modelo_contrato text DEFAULT NULL::text, p_data_nascimento date DEFAULT NULL::date, p_dia_pagamento integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pending_record pending_people%ROWTYPE;
  v_new_person_id text;
  v_final_email text;
  v_slack_user_id text;
  v_linked_to int := 0;
  v_linked_from int := 0;
  k record;
BEGIN
  SELECT * INTO v_pending_record
  FROM pending_people
  WHERE id = p_pending_id AND status = 'PENDENTE';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cadastro pendente não encontrado');
  END IF;

  v_final_email := COALESCE(p_email, v_pending_record.email);
  v_slack_user_id := v_pending_record.slack_user_id;

  IF v_final_email IS NOT NULL AND EXISTS (SELECT 1 FROM people WHERE lower(email) = lower(v_final_email)) THEN
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
    modelo_contrato, ativo, is_admin, dia_pagamento, slack_user_id
  ) VALUES (
    v_new_person_id,
    COALESCE(p_nome, v_pending_record.nome),
    v_final_email,
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
    COALESCE(p_dia_pagamento, v_pending_record.dia_pagamento),
    v_slack_user_id
  );

  UPDATE pending_people
  SET status = 'APROVADO',
      reviewed_by = p_reviewer_id,
      reviewed_at = now(),
      director_notes = p_director_notes
  WHERE id = p_pending_id;

  FOR k IN
    SELECT id FROM kudos
    WHERE pending_to = true
      AND (
        (v_slack_user_id IS NOT NULL AND to_slack_user_id = v_slack_user_id)
        OR (v_final_email IS NOT NULL AND lower(to_slack_email) = lower(v_final_email))
      )
  LOOP
    UPDATE kudos SET to_person_id = v_new_person_id, pending_to = false WHERE id = k.id;
    PERFORM public.award_points(v_new_person_id, 10, 'kudo_received'::engagement_reason, k.id::text);
    v_linked_to := v_linked_to + 1;
  END LOOP;

  FOR k IN
    SELECT id FROM kudos
    WHERE pending_from = true
      AND (
        (v_slack_user_id IS NOT NULL AND from_slack_user_id = v_slack_user_id)
        OR (v_final_email IS NOT NULL AND lower(from_slack_email) = lower(v_final_email))
      )
  LOOP
    UPDATE kudos SET from_person_id = v_new_person_id, pending_from = false WHERE id = k.id;
    PERFORM public.award_points(v_new_person_id, 2, 'kudo_given'::engagement_reason, k.id::text);
    v_linked_from := v_linked_from + 1;
  END LOOP;

  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES (
    'pending_people',
    p_pending_id::text,
    'APPROVE_PERSON',
    p_reviewer_id,
    jsonb_build_object(
      'new_person_id', v_new_person_id,
      'director_notes', p_director_notes,
      'linked_kudos_received', v_linked_to,
      'linked_kudos_given', v_linked_from,
      'slack_user_id', v_slack_user_id,
      'source', v_pending_record.source
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'person_id', v_new_person_id,
    'linked_kudos_received', v_linked_to,
    'linked_kudos_given', v_linked_from,
    'message', 'Colaborador aprovado e cadastrado com sucesso'
  );
END;
$function$;
