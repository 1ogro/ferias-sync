DROP FUNCTION IF EXISTS public.get_pulse_responses_safe(uuid);
CREATE FUNCTION public.get_pulse_responses_safe(p_survey_id uuid)
 RETURNS TABLE(id uuid, run_id uuid, question_id uuid, respondent_id text, respondent_name text, anonymous_label text, scale_value integer, text_value text, submitted_at timestamp with time zone, survey_id uuid, sub_time text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller text; v_is_admin boolean; v_is_gerente boolean; v_creator text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_caller := public.current_person_id();
  v_is_admin := public.is_admin_or_director();
  v_is_gerente := public.is_gerente_only();
  SELECT created_by INTO v_creator FROM public.pulse_surveys WHERE pulse_surveys.id = p_survey_id;
  IF v_creator IS NULL THEN RETURN; END IF;
  IF NOT (v_is_admin OR public.is_manager_level() OR v_creator = v_caller) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT resp.*, r.survey_id AS sid, s.anonymous AS anon, p.nome AS pnome, p.papel AS ppapel,
      CASE WHEN public.is_active_team(p.sub_time) THEN p.sub_time ELSE 'Sem time' END AS team,
      (NOT s.anonymous AND (v_is_admin OR public.is_in_my_manager_scope(resp.respondent_id))) AS visible
    FROM public.pulse_responses resp
    JOIN public.pulse_runs r ON r.id = resp.run_id
    JOIN public.pulse_surveys s ON s.id = r.survey_id
    LEFT JOIN public.people p ON p.id = resp.respondent_id
    WHERE r.survey_id = p_survey_id
      AND (NOT v_is_gerente OR v_creator = v_caller OR COALESCE(p.papel,'') NOT IN ('DIRETOR','GERENTE'))
  )
  SELECT b.id, b.run_id, b.question_id,
    CASE WHEN b.visible THEN b.respondent_id ELSE NULL END,
    CASE WHEN b.visible THEN b.pnome ELSE NULL END,
    CASE WHEN b.visible THEN NULL ELSE 'R' || dense_rank() OVER (ORDER BY b.respondent_id)::text END,
    b.scale_value, b.text_value, b.submitted_at, b.sid, b.team
  FROM base b
  ORDER BY b.submitted_at DESC;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_pulse_responses_safe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pulse_responses_safe(uuid) TO authenticated;