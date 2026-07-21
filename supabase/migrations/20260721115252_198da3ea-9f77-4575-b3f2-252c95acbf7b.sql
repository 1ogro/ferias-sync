CREATE OR REPLACE FUNCTION public.get_pulse_checkin_averages_v2()
RETURNS TABLE(
  week_checkin_avg numeric, week_checkin_count bigint,
  week_checkout_avg numeric, week_checkout_count bigint,
  month_checkin_avg numeric, month_checkin_count bigint,
  month_checkout_avg numeric, month_checkout_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_week_start timestamptz;
BEGIN
  IF NOT public.is_admin_or_director() AND NOT EXISTS (
    SELECT 1 FROM profiles pr JOIN people p ON p.id = pr.person_id
    WHERE pr.user_id = auth.uid() AND p.papel = 'GESTOR'
  ) THEN
    RETURN QUERY SELECT NULL::numeric, 0::bigint, NULL::numeric, 0::bigint,
                        NULL::numeric, 0::bigint, NULL::numeric, 0::bigint;
    RETURN;
  END IF;

  -- Start of ISO week (Monday 00:00) in America/Sao_Paulo, converted back to UTC
  v_week_start := (date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo'))) AT TIME ZONE 'America/Sao_Paulo';

  RETURN QUERY
  WITH base AS (
    SELECT
      CASE EXTRACT(dow FROM (resp.submitted_at AT TIME ZONE 'America/Sao_Paulo'))::int
        WHEN 1 THEN 'in' WHEN 2 THEN 'in' WHEN 3 THEN 'in' WHEN 4 THEN 'in'
        ELSE 'out'
      END AS bucket,
      resp.scale_value,
      resp.submitted_at
    FROM pulse_responses resp
    JOIN pulse_questions q ON q.id = resp.question_id
    WHERE q.question_type = 'scale_1_5'
      AND resp.scale_value IS NOT NULL
      AND resp.submitted_at >= LEAST(v_week_start, now() - interval '30 days')
  )
  SELECT
    ROUND(AVG(scale_value) FILTER (WHERE bucket = 'in'  AND submitted_at >= v_week_start)::numeric, 2),
    COUNT(*)                FILTER (WHERE bucket = 'in'  AND submitted_at >= v_week_start),
    ROUND(AVG(scale_value) FILTER (WHERE bucket = 'out' AND submitted_at >= v_week_start)::numeric, 2),
    COUNT(*)                FILTER (WHERE bucket = 'out' AND submitted_at >= v_week_start),
    ROUND(AVG(scale_value) FILTER (WHERE bucket = 'in'  AND submitted_at >= now() - interval '30 days')::numeric, 2),
    COUNT(*)                FILTER (WHERE bucket = 'in'  AND submitted_at >= now() - interval '30 days'),
    ROUND(AVG(scale_value) FILTER (WHERE bucket = 'out' AND submitted_at >= now() - interval '30 days')::numeric, 2),
    COUNT(*)                FILTER (WHERE bucket = 'out' AND submitted_at >= now() - interval '30 days')
  FROM base;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pulse_checkin_averages_v2() TO authenticated;