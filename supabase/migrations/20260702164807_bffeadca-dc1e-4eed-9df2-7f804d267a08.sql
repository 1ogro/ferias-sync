CREATE OR REPLACE FUNCTION public.get_engagement_leaderboard(p_scope text DEFAULT 'team'::text, p_period text DEFAULT 'month'::text)
 RETURNS TABLE(person_id text, nome text, sub_time text, total_points bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id text;
  v_caller_team text;
  v_is_admin_dir boolean;
  v_since timestamptz;
BEGIN
  v_caller_id := public.current_person_id();
  v_is_admin_dir := public.is_admin_or_director();

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
    AND (
      v_is_admin_dir
      OR (p_scope = 'team' AND pe.sub_time IS NOT NULL AND pe.sub_time = v_caller_team)
      OR pe.id = v_caller_id
    )
  GROUP BY pe.id, pe.nome, pe.sub_time
  ORDER BY total_points DESC, pe.nome
  LIMIT 50;
END;
$function$;