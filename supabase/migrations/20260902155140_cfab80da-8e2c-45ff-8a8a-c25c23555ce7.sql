CREATE OR REPLACE FUNCTION public.get_engagement_team_summary(p_month date, p_scope text DEFAULT 'team')
RETURNS TABLE(
  sub_time text,
  people_count integer,
  kudos integer,
  peer_feedbacks integer,
  external_feedbacks integer,
  total integer,
  avg_per_person numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH me AS (SELECT public.current_person_id() AS pid),
  my_row AS (SELECT p.id, p.sub_time FROM public.people p, me WHERE p.id = me.pid),
  scope AS (
    SELECT p.id, COALESCE(p.sub_time, 'Sem time') AS sub_time
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
  ),
  per_person AS (
    SELECT
      s.id,
      s.sub_time,
      COALESCE(k.c, 0) AS kudos,
      COALESCE(pr.c, 0) AS peer_feedbacks,
      COALESCE(ef.c, 0) AS external_feedbacks
    FROM scope s
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS c FROM public.kudos k, bounds b
      WHERE k.to_person_id = s.id AND k.created_at >= b.s AND k.created_at < b.e
    ) k ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS c FROM public.pulse_responses r, bounds b
      WHERE r.subject_id = s.id AND r.submitted_at >= b.s AND r.submitted_at < b.e
    ) pr ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS c FROM public.external_feedbacks f, bounds b
      WHERE f.person_id = s.id AND f.created_at >= b.s AND f.created_at < b.e
    ) ef ON true
  )
  SELECT
    pp.sub_time,
    count(*)::int AS people_count,
    sum(pp.kudos)::int,
    sum(pp.peer_feedbacks)::int,
    sum(pp.external_feedbacks)::int,
    sum(pp.kudos + pp.peer_feedbacks + pp.external_feedbacks)::int AS total,
    ROUND(
      sum(pp.kudos + pp.peer_feedbacks + pp.external_feedbacks)::numeric
      / NULLIF(count(*), 0), 2
    ) AS avg_per_person
  FROM per_person pp
  GROUP BY pp.sub_time
  ORDER BY pp.sub_time;
$$;

REVOKE ALL ON FUNCTION public.get_engagement_team_summary(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_engagement_team_summary(date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_feedback_coverage_by_author(p_since timestamptz DEFAULT NULL)
RETURNS TABLE(
  author_id text,
  author_label text,
  person_id text,
  person_name text,
  feedbacks integer,
  last_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH scope AS (
    SELECT p.id, p.nome
    FROM public.people p
    WHERE p.ativo IS DISTINCT FROM false
      AND public.can_manage_person_feedback(p.id)
  )
  SELECT
    f.author_id,
    COALESCE(a.nome, 'Desconhecido') AS author_label,
    f.person_id,
    s.nome AS person_name,
    count(*)::int AS feedbacks,
    max(f.created_at) AS last_at
  FROM public.external_feedbacks f
  JOIN scope s ON s.id = f.person_id
  LEFT JOIN public.people a ON a.id = f.author_id
  WHERE p_since IS NULL OR f.created_at >= p_since
  GROUP BY f.author_id, a.nome, f.person_id, s.nome
  ORDER BY COALESCE(a.nome, 'Desconhecido'), s.nome;
$$;

REVOKE ALL ON FUNCTION public.get_feedback_coverage_by_author(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feedback_coverage_by_author(timestamptz) TO authenticated;