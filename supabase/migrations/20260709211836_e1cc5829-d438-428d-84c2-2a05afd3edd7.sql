DROP FUNCTION IF EXISTS public.get_kudos_feed(integer);

CREATE OR REPLACE FUNCTION public.get_kudos_feed(p_limit integer DEFAULT 50)
RETURNS TABLE(
  id uuid,
  from_person_id text,
  to_person_id text,
  from_person_nome text,
  to_person_nome text,
  from_slack_name text,
  to_slack_name text,
  from_slack_user_id text,
  to_slack_user_id text,
  pending_from boolean,
  pending_to boolean,
  message text,
  category kudos_category,
  slack_channel_posted text,
  created_at timestamptz,
  recipient_dm_status text,
  recipient_dm_error text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    k.id,
    k.from_person_id,
    k.to_person_id,
    pf.nome AS from_person_nome,
    pt.nome AS to_person_nome,
    k.from_slack_name,
    k.to_slack_name,
    k.from_slack_user_id,
    k.to_slack_user_id,
    k.pending_from,
    k.pending_to,
    k.message,
    k.category,
    k.slack_channel_posted,
    k.created_at,
    dm.status AS recipient_dm_status,
    dm.error  AS recipient_dm_error
  FROM public.kudos k
  LEFT JOIN public.people pf ON pf.id = k.from_person_id
  LEFT JOIN public.people pt ON pt.id = k.to_person_id
  LEFT JOIN LATERAL (
    SELECT
      (al.payload->>'status') AS status,
      (al.payload->>'error')  AS error
    FROM public.audit_logs al
    WHERE al.entidade = 'kudos'
      AND al.acao = 'KUDOS_RECIPIENT_DM'
      AND al.entidade_id = k.id::text || ':' || k.to_person_id
    ORDER BY al.created_at DESC
    LIMIT 1
  ) dm ON true
  WHERE auth.uid() IS NOT NULL
  ORDER BY k.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
$$;

REVOKE EXECUTE ON FUNCTION public.get_kudos_feed(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kudos_feed(integer) TO authenticated;