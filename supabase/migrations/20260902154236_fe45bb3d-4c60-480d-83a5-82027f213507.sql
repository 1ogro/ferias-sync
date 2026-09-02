CREATE OR REPLACE FUNCTION public.get_engagement_monthly_report(p_month date, p_scope text DEFAULT 'team')
RETURNS TABLE(
  person_id text,
  nome text,
  sub_time text,
  kudos_received integer,
  kudos_given integer,
  peer_feedbacks integer,
  external_feedbacks integer,
  total integer,
  last_activity_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (
    SELECT public.current_person_id() AS pid
  ),
  my_row AS (
    SELECT p.id, p.sub_time FROM public.people p, me WHERE p.id = me.pid
  ),
  scope AS (
    SELECT p.id, p.nome, p.sub_time
    FROM public.people p
    WHERE p.ativo IS DISTINCT FROM false
      AND public.can_manage_person_feedback(p.id)
      AND (
        COALESCE(p_scope, 'team') <> 'team'
        OR p.gestor_id = (SELECT pid FROM me)
        OR (p.sub_time IS NOT NULL AND p.sub_time = (SELECT sub_time FROM my_row))
      )
  ),
  bounds AS (
    SELECT date_trunc('month', p_month::timestamptz) AS s,
           date_trunc('month', p_month::timestamptz) + interval '1 month' AS e
  )
  SELECT
    s.id,
    s.nome,
    s.sub_time,
    COALESCE(kr.c, 0)::int,
    COALESCE(kg.c, 0)::int,
    COALESCE(pr.c, 0)::int,
    COALESCE(ef.c, 0)::int,
    (COALESCE(kr.c,0) + COALESCE(kg.c,0) + COALESCE(pr.c,0) + COALESCE(ef.c,0))::int,
    GREATEST(
      COALESCE(kr.last, '-infinity'::timestamptz),
      COALESCE(kg.last, '-infinity'::timestamptz),
      COALESCE(pr.last, '-infinity'::timestamptz),
      COALESCE(ef.last, '-infinity'::timestamptz)
    ) AS last_activity_at
  FROM scope s
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS c, max(k.created_at) AS last
    FROM public.kudos k, bounds b
    WHERE k.to_person_id = s.id AND k.created_at >= b.s AND k.created_at < b.e
  ) kr ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS c, max(k.created_at) AS last
    FROM public.kudos k, bounds b
    WHERE k.from_person_id = s.id AND k.created_at >= b.s AND k.created_at < b.e
  ) kg ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS c, max(r.submitted_at) AS last
    FROM public.pulse_responses r, bounds b
    WHERE r.subject_id = s.id AND r.submitted_at >= b.s AND r.submitted_at < b.e
  ) pr ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS c, max(f.created_at) AS last
    FROM public.external_feedbacks f, bounds b
    WHERE f.person_id = s.id AND f.created_at >= b.s AND f.created_at < b.e
  ) ef ON true
  ORDER BY s.nome;
$$;

REVOKE ALL ON FUNCTION public.get_engagement_monthly_report(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_engagement_monthly_report(date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_engagement_monthly_contributors(p_month date, p_scope text DEFAULT 'team')
RETURNS TABLE(author_id text, author_name text, feedbacks integer, last_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (SELECT public.current_person_id() AS pid),
  my_row AS (SELECT p.id, p.sub_time FROM public.people p, me WHERE p.id = me.pid),
  scope AS (
    SELECT p.id
    FROM public.people p
    WHERE p.ativo IS DISTINCT FROM false
      AND public.can_manage_person_feedback(p.id)
      AND (
        COALESCE(p_scope, 'team') <> 'team'
        OR p.gestor_id = (SELECT pid FROM me)
        OR (p.sub_time IS NOT NULL AND p.sub_time = (SELECT sub_time FROM my_row))
      )
  ),
  bounds AS (
    SELECT date_trunc('month', p_month::timestamptz) AS s,
           date_trunc('month', p_month::timestamptz) + interval '1 month' AS e
  )
  SELECT f.author_id,
         COALESCE(a.nome, 'Desconhecido') AS author_name,
         count(*)::int AS feedbacks,
         max(f.created_at) AS last_at
  FROM public.external_feedbacks f
  JOIN scope s ON s.id = f.person_id
  CROSS JOIN bounds b
  LEFT JOIN public.people a ON a.id = f.author_id
  WHERE f.created_at >= b.s AND f.created_at < b.e
  GROUP BY f.author_id, a.nome
  ORDER BY count(*) DESC;
$$;

REVOKE ALL ON FUNCTION public.get_engagement_monthly_contributors(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_engagement_monthly_contributors(date, text) TO authenticated;