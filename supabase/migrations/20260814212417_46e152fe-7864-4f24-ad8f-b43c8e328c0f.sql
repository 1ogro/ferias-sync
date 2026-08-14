-- 1. Manager-level helper
CREATE OR REPLACE FUNCTION public.is_manager_level()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles pr
    JOIN people p ON p.id = pr.person_id
    WHERE pr.user_id = auth.uid()
      AND (p.is_admin = true OR p.papel IN ('DIRETOR','ADMIN','GERENTE'))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_gerente_only()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles pr
    JOIN people p ON p.id = pr.person_id
    WHERE pr.user_id = auth.uid()
      AND COALESCE(p.is_admin, false) = false
      AND p.papel = 'GERENTE'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_manager_level() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_gerente_only() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_manager_level() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_gerente_only() TO authenticated, service_role;

-- 2. Read/管理 access for manager level (vacation management scope)
CREATE POLICY "Manager level can view all people"
  ON public.people FOR SELECT TO authenticated
  USING (public.is_manager_level());

CREATE POLICY "Manager level can view all requests"
  ON public.requests FOR SELECT TO authenticated
  USING (public.is_manager_level());

CREATE POLICY "Manager level can view all approvals"
  ON public.approvals FOR SELECT TO authenticated
  USING (public.is_manager_level());

CREATE POLICY "Manager level can view all vacation balances"
  ON public.vacation_balances FOR SELECT TO authenticated
  USING (public.is_manager_level());

CREATE POLICY "Manager level can manage vacation balances"
  ON public.vacation_balances FOR ALL TO authenticated
  USING (public.is_manager_level())
  WITH CHECK (public.is_manager_level());

CREATE POLICY "Manager level can manage medical leaves"
  ON public.medical_leaves FOR ALL TO authenticated
  USING (public.is_manager_level())
  WITH CHECK (public.is_manager_level());

CREATE POLICY "Manager level can view capacity alerts"
  ON public.team_capacity_alerts FOR SELECT TO authenticated
  USING (public.is_manager_level());

CREATE POLICY "Manager level can view special approvals"
  ON public.special_approvals FOR SELECT TO authenticated
  USING (public.is_manager_level());

-- 3. Pulses visibility for manager level
CREATE POLICY "pulse_surveys_select_manager_level"
  ON public.pulse_surveys FOR SELECT TO authenticated
  USING (public.is_manager_level());

CREATE POLICY "pulse_runs_select_manager_level"
  ON public.pulse_runs FOR SELECT TO authenticated
  USING (public.is_manager_level());

CREATE POLICY "pulse_questions_select_manager_level"
  ON public.pulse_questions FOR SELECT TO authenticated
  USING (public.is_manager_level());

DROP POLICY IF EXISTS "pulse_surveys_insert" ON public.pulse_surveys;
CREATE POLICY "pulse_surveys_insert"
  ON public.pulse_surveys FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.current_person_id()
    AND EXISTS (
      SELECT 1 FROM people p
      WHERE p.id = public.current_person_id()
        AND (p.is_admin = true OR p.papel IN ('DIRETOR','ADMIN','GESTOR','GERENTE'))
    )
  );

-- 4. Engagement leaderboard: exclude GERENTE like DIRETOR
CREATE OR REPLACE FUNCTION public.get_engagement_leaderboard(p_scope text DEFAULT 'team'::text, p_period text DEFAULT 'month'::text)
 RETURNS TABLE(person_id text, nome text, sub_time text, total_points bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id text;
  v_caller_team text;
  v_is_broad boolean;
  v_since timestamptz;
BEGIN
  v_caller_id := public.current_person_id();
  v_is_broad := public.is_manager_level();

  SELECT p.sub_time INTO v_caller_team FROM public.people p WHERE p.id = v_caller_id;

  v_since := CASE
    WHEN p_period = 'month'   THEN date_trunc('month',   now())
    WHEN p_period = 'quarter' THEN date_trunc('quarter', now())
    WHEN p_period = 'year'    THEN date_trunc('year',    now())
    ELSE '1970-01-01'::timestamptz
  END;

  RETURN QUERY
  SELECT
    pe.id::text AS person_id,
    pe.nome,
    pe.sub_time,
    COALESCE(SUM(ep.points), 0)::bigint AS total_points
  FROM public.people pe
  LEFT JOIN public.engagement_points ep
    ON ep.person_id = pe.id AND ep.created_at >= v_since
  WHERE pe.ativo = true
    AND COALESCE(pe.papel, '') NOT IN ('DIRETOR','GERENTE')
    AND (
      v_is_broad
      OR (p_scope = 'team' AND pe.sub_time IS NOT NULL AND pe.sub_time = v_caller_team)
      OR pe.id = v_caller_id
    )
  GROUP BY pe.id, pe.nome, pe.sub_time
  ORDER BY total_points DESC, pe.nome
  LIMIT 50;
END;
$function$;

-- 5. Pulse responses: manager level allowed, but partial for GERENTE
CREATE OR REPLACE FUNCTION public.get_pulse_responses_safe(p_survey_id uuid)
 RETURNS TABLE(id uuid, run_id uuid, question_id uuid, respondent_id text, respondent_name text, anonymous_label text, scale_value integer, text_value text, submitted_at timestamp with time zone, survey_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller text;
  v_is_admin boolean;
  v_is_gerente boolean;
  v_creator text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_caller := public.current_person_id();
  v_is_admin := public.is_admin_or_director();
  v_is_gerente := public.is_gerente_only();

  SELECT created_by INTO v_creator
  FROM public.pulse_surveys
  WHERE pulse_surveys.id = p_survey_id;

  IF v_creator IS NULL THEN
    RETURN;
  END IF;

  IF NOT (v_is_admin OR v_is_gerente OR v_creator = v_caller) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    resp.id,
    resp.run_id,
    resp.question_id,
    CASE WHEN s.anonymous OR (v_is_gerente AND v_creator <> v_caller) THEN NULL::text ELSE resp.respondent_id END,
    CASE WHEN s.anonymous OR (v_is_gerente AND v_creator <> v_caller) THEN NULL::text ELSE p.nome END,
    CASE
      WHEN s.anonymous OR (v_is_gerente AND v_creator <> v_caller)
        THEN 'R' || dense_rank() OVER (PARTITION BY r.survey_id ORDER BY resp.respondent_id)::text
      ELSE NULL::text
    END,
    resp.scale_value,
    resp.text_value,
    resp.submitted_at,
    r.survey_id
  FROM public.pulse_responses resp
  JOIN public.pulse_runs r ON r.id = resp.run_id
  JOIN public.pulse_surveys s ON s.id = r.survey_id
  LEFT JOIN public.people p ON p.id = resp.respondent_id
  WHERE r.survey_id = p_survey_id
    AND (
      NOT v_is_gerente
      OR v_creator = v_caller
      OR COALESCE(p.papel, '') NOT IN ('DIRETOR','GERENTE')
    )
  ORDER BY resp.submitted_at DESC;
END;
$function$;

-- 6. Aggregated pulse averages available to manager level
CREATE OR REPLACE FUNCTION public.get_pulse_checkin_averages_v2()
 RETURNS TABLE(week_checkin_avg numeric, week_checkin_count bigint, week_checkin_start date, week_checkout_avg numeric, week_checkout_count bigint, week_checkout_start date, month_checkin_avg numeric, month_checkin_count bigint, month_checkout_avg numeric, month_checkout_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_manager_level() AND NOT EXISTS (
    SELECT 1 FROM profiles pr JOIN people p ON p.id = pr.person_id
    WHERE pr.user_id = auth.uid() AND p.papel = 'GESTOR'
  ) THEN
    RETURN QUERY SELECT NULL::numeric, 0::bigint, NULL::date,
                        NULL::numeric, 0::bigint, NULL::date,
                        NULL::numeric, 0::bigint,
                        NULL::numeric, 0::bigint;
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      CASE EXTRACT(dow FROM (resp.submitted_at AT TIME ZONE 'America/Sao_Paulo'))::int
        WHEN 1 THEN 'in' WHEN 2 THEN 'in' WHEN 3 THEN 'in' WHEN 4 THEN 'in'
        ELSE 'out'
      END AS bucket,
      resp.scale_value,
      resp.submitted_at,
      (date_trunc('week', (resp.submitted_at AT TIME ZONE 'America/Sao_Paulo')))::date AS week_start
    FROM pulse_responses resp
    JOIN pulse_questions q ON q.id = resp.question_id
    WHERE q.question_type = 'scale_1_5'
      AND resp.scale_value IS NOT NULL
      AND resp.submitted_at >= now() - interval '120 days'
  ),
  latest_in AS (SELECT MAX(week_start) AS ws FROM base WHERE bucket = 'in'),
  latest_out AS (SELECT MAX(week_start) AS ws FROM base WHERE bucket = 'out')
  SELECT
    ROUND(AVG(b.scale_value) FILTER (WHERE b.bucket = 'in'  AND b.week_start = (SELECT ws FROM latest_in))::numeric, 2),
    COUNT(*)                 FILTER (WHERE b.bucket = 'in'  AND b.week_start = (SELECT ws FROM latest_in)),
    (SELECT ws FROM latest_in),
    ROUND(AVG(b.scale_value) FILTER (WHERE b.bucket = 'out' AND b.week_start = (SELECT ws FROM latest_out))::numeric, 2),
    COUNT(*)                 FILTER (WHERE b.bucket = 'out' AND b.week_start = (SELECT ws FROM latest_out)),
    (SELECT ws FROM latest_out),
    ROUND(AVG(b.scale_value) FILTER (WHERE b.bucket = 'in'  AND b.submitted_at >= now() - interval '30 days')::numeric, 2),
    COUNT(*)                 FILTER (WHERE b.bucket = 'in'  AND b.submitted_at >= now() - interval '30 days'),
    ROUND(AVG(b.scale_value) FILTER (WHERE b.bucket = 'out' AND b.submitted_at >= now() - interval '30 days')::numeric, 2),
    COUNT(*)                 FILTER (WHERE b.bucket = 'out' AND b.submitted_at >= now() - interval '30 days')
  FROM base b;
END;
$function$;

-- 7. Vacation summary available to manager level
CREATE OR REPLACE FUNCTION public.get_vacation_summary(p_year integer DEFAULT NULL::integer)
 RETURNS TABLE(total_people integer, without_contract integer, accumulated_vacations integer, average_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_year integer;
BEGIN
  target_year := COALESCE(p_year, EXTRACT(year FROM now())::integer);

  IF NOT public.is_manager_level() THEN
    RAISE EXCEPTION 'Access denied: Only admins, directors and managers can view vacation summary';
  END IF;

  RETURN QUERY
  WITH vacation_data AS (
    SELECT
      p.id,
      p.nome,
      p.data_contrato,
      CASE
        WHEN vb.id IS NOT NULL THEN vb.balance_days
        WHEN p.data_contrato IS NULL THEN 0
        ELSE GREATEST(0,
          (target_year - EXTRACT(year FROM p.data_contrato)::integer) * 30 -
          COALESCE((
            SELECT SUM(fim - inicio + 1)
            FROM requests r
            WHERE r.requester_id = p.id
            AND r.tipo = 'FERIAS'
            AND (r.status = 'REALIZADO' OR (r.status = 'APROVADO_FINAL' AND r.fim < now()::date))
            AND r.inicio IS NOT NULL AND r.fim IS NOT NULL
          ), 0)
        )
      END as balance_days
    FROM people p
    LEFT JOIN vacation_balances vb ON vb.person_id = p.id AND vb.year = target_year
    WHERE p.ativo = true
  )
  SELECT
    COUNT(*)::integer,
    COUNT(CASE WHEN data_contrato IS NULL THEN 1 END)::integer,
    COUNT(CASE WHEN balance_days > 30 THEN 1 END)::integer,
    COALESCE(ROUND(AVG(CASE WHEN balance_days > 0 THEN balance_days END), 0), 0)::numeric
  FROM vacation_data;
END;
$function$;