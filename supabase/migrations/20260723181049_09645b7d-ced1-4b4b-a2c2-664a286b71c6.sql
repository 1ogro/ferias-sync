DROP FUNCTION IF EXISTS public.get_pulse_checkin_averages_v2();

CREATE OR REPLACE FUNCTION public.get_pulse_checkin_averages_v2()
RETURNS TABLE(
  week_checkin_avg numeric, week_checkin_count bigint, week_checkin_start date,
  week_checkout_avg numeric, week_checkout_count bigint, week_checkout_start date,
  month_checkin_avg numeric, month_checkin_count bigint,
  month_checkout_avg numeric, month_checkout_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_director() AND NOT EXISTS (
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

GRANT EXECUTE ON FUNCTION public.get_pulse_checkin_averages_v2() TO authenticated;