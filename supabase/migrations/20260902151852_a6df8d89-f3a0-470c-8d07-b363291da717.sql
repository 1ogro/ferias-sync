ALTER TABLE public.external_feedback_attachments
  ALTER COLUMN storage_path DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'file';

ALTER TABLE public.external_feedback_attachments
  ADD CONSTRAINT external_feedback_attachments_kind_check
  CHECK (
    (kind = 'file' AND storage_path IS NOT NULL)
    OR (kind = 'link' AND external_url IS NOT NULL AND external_url ~* '^https?://')
  );

CREATE OR REPLACE FUNCTION public.get_person_feedback_timeline(p_person_id text, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(id text, kind text, occurred_at timestamp with time zone, author_label text, title text, content text, tag text, visible_to_subject boolean, attachments jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_me text := public.current_person_id();
  v_can_manage boolean := public.can_manage_person_feedback(p_person_id);
BEGIN
  IF NOT v_can_manage AND v_me IS DISTINCT FROM p_person_id THEN
    RAISE EXCEPTION 'Sem permissão para ver feedbacks desta pessoa';
  END IF;

  RETURN QUERY
  SELECT
    'kudo:' || k.id::text,
    'kudo'::text,
    k.created_at,
    COALESCE(fp.nome, k.from_slack_name, 'Alguém'),
    'Kudo recebido'::text,
    k.message,
    k.category::text,
    true,
    '[]'::jsonb
  FROM public.kudos k
  LEFT JOIN public.people fp ON fp.id = k.from_person_id
  WHERE k.to_person_id = p_person_id
    AND (p_since IS NULL OR k.created_at >= p_since)

  UNION ALL

  SELECT
    'pulse:' || r.id::text,
    'peer'::text,
    r.submitted_at,
    CASE WHEN s.peer_anonymous OR s.anonymous THEN 'Par anônimo' ELSE COALESCE(rp.nome, 'Par') END,
    COALESCE(s.title, 'Pulse'),
    COALESCE(r.text_value, CASE WHEN r.scale_value IS NOT NULL THEN 'Nota: ' || r.scale_value::text ELSE '' END),
    CASE WHEN r.scale_value IS NOT NULL THEN r.scale_value::text ELSE NULL END,
    false,
    '[]'::jsonb
  FROM public.pulse_responses r
  JOIN public.pulse_runs run ON run.id = r.run_id
  JOIN public.pulse_surveys s ON s.id = run.survey_id
  LEFT JOIN public.people rp ON rp.id = r.respondent_id
  WHERE r.subject_id = p_person_id
    AND v_can_manage
    AND (r.text_value IS NOT NULL OR r.scale_value IS NOT NULL)
    AND (p_since IS NULL OR r.submitted_at >= p_since)

  UNION ALL

  SELECT
    'ext:' || f.id::text,
    'external'::text,
    f.feedback_date::timestamptz,
    COALESCE(f.stakeholder_name, 'Stakeholder')
      || CASE WHEN f.stakeholder_org IS NOT NULL AND f.stakeholder_org <> '' THEN ' · ' || f.stakeholder_org ELSE '' END,
    'Feedback externo (' || f.channel || ')',
    f.content,
    f.tone,
    f.visible_to_subject,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'storage_path', a.storage_path, 'file_name', a.file_name,
        'mime_type', a.mime_type, 'kind', a.kind, 'external_url', a.external_url
      ) ORDER BY a.created_at)
      FROM public.external_feedback_attachments a WHERE a.feedback_id = f.id
    ), '[]'::jsonb)
  FROM public.external_feedbacks f
  WHERE f.person_id = p_person_id
    AND (v_can_manage OR (f.visible_to_subject AND f.person_id = v_me))
    AND (p_since IS NULL OR f.feedback_date::timestamptz >= p_since)

  ORDER BY 3 DESC;
END;
$function$;