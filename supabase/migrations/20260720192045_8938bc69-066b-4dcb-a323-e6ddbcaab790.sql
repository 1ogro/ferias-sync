CREATE OR REPLACE FUNCTION public.get_pulse_checkin_averages()
RETURNS TABLE(checkin_avg numeric, checkin_count bigint, checkout_avg numeric, checkout_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_or_director() AND NOT EXISTS (
    SELECT 1 FROM profiles pr JOIN people p ON p.id = pr.person_id
    WHERE pr.user_id = auth.uid() AND p.papel = 'GESTOR'
  ) THEN
    RETURN QUERY SELECT NULL::numeric, 0::bigint, NULL::numeric, 0::bigint;
    RETURN;
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      CASE EXTRACT(dow FROM (resp.submitted_at AT TIME ZONE 'America/Sao_Paulo'))::int
        WHEN 1 THEN 'in'
        WHEN 2 THEN 'in'
        WHEN 3 THEN 'in'
        WHEN 4 THEN 'in'
        WHEN 5 THEN 'out'
        WHEN 6 THEN 'out'
        WHEN 0 THEN 'out'
      END AS bucket,
      resp.scale_value
    FROM pulse_responses resp
    JOIN pulse_questions q ON q.id = resp.question_id
    WHERE q.question_type = 'scale_1_5'
      AND resp.scale_value IS NOT NULL
      AND resp.submitted_at >= now() - interval '30 days'
  )
  SELECT
    ROUND(AVG(scale_value) FILTER (WHERE bucket = 'in')::numeric, 2),
    COUNT(*) FILTER (WHERE bucket = 'in'),
    ROUND(AVG(scale_value) FILTER (WHERE bucket = 'out')::numeric, 2),
    COUNT(*) FILTER (WHERE bucket = 'out')
  FROM agg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pulse_checkin_averages() TO authenticated;