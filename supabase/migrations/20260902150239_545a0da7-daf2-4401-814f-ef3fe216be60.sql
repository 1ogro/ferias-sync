-- Scope helper
CREATE OR REPLACE FUNCTION public.can_manage_person_feedback(_person_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_or_director()
      OR EXISTS (
        SELECT 1 FROM public.people target
        JOIN public.people me ON me.id = public.current_person_id()
        WHERE target.id = _person_id
          AND (
            target.gestor_id = me.id
            OR (
              me.papel = 'GERENTE'
              AND me.sub_time IS NOT NULL
              AND target.sub_time = me.sub_time
            )
          )
      );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_person_feedback(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_person_feedback(text) TO authenticated;

CREATE TABLE public.external_feedbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  author_id text REFERENCES public.people(id) ON DELETE SET NULL,
  stakeholder_name text NOT NULL,
  stakeholder_org text,
  channel text NOT NULL DEFAULT 'outro' CHECK (channel IN ('slack','email','reuniao','outro')),
  feedback_date date NOT NULL DEFAULT CURRENT_DATE,
  tone text NOT NULL DEFAULT 'positivo' CHECK (tone IN ('positivo','construtivo','neutro')),
  content text NOT NULL,
  visible_to_subject boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_feedbacks TO authenticated;
GRANT ALL ON public.external_feedbacks TO service_role;
ALTER TABLE public.external_feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View feedbacks in scope"
ON public.external_feedbacks FOR SELECT TO authenticated
USING (
  public.can_manage_person_feedback(person_id)
  OR (visible_to_subject AND person_id = public.current_person_id())
);

CREATE POLICY "Managers create feedbacks in scope"
ON public.external_feedbacks FOR INSERT TO authenticated
WITH CHECK (
  public.can_manage_person_feedback(person_id)
  AND author_id = public.current_person_id()
);

CREATE POLICY "Author or leadership updates feedbacks"
ON public.external_feedbacks FOR UPDATE TO authenticated
USING (author_id = public.current_person_id() OR public.is_admin_or_director())
WITH CHECK (author_id = public.current_person_id() OR public.is_admin_or_director());

CREATE POLICY "Author or leadership deletes feedbacks"
ON public.external_feedbacks FOR DELETE TO authenticated
USING (author_id = public.current_person_id() OR public.is_admin_or_director());

CREATE TRIGGER update_external_feedbacks_updated_at
BEFORE UPDATE ON public.external_feedbacks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_external_feedbacks_person ON public.external_feedbacks(person_id, feedback_date DESC);

CREATE TABLE public.external_feedback_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.external_feedbacks(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.external_feedback_attachments TO authenticated;
GRANT ALL ON public.external_feedback_attachments TO service_role;
ALTER TABLE public.external_feedback_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View attachments of visible feedbacks"
ON public.external_feedback_attachments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.external_feedbacks f
  WHERE f.id = feedback_id
    AND (
      public.can_manage_person_feedback(f.person_id)
      OR (f.visible_to_subject AND f.person_id = public.current_person_id())
    )
));

CREATE POLICY "Author adds attachments"
ON public.external_feedback_attachments FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.external_feedbacks f
  WHERE f.id = feedback_id
    AND (f.author_id = public.current_person_id() OR public.is_admin_or_director())
));

CREATE POLICY "Author deletes attachments"
ON public.external_feedback_attachments FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.external_feedbacks f
  WHERE f.id = feedback_id
    AND (f.author_id = public.current_person_id() OR public.is_admin_or_director())
));

CREATE INDEX idx_external_feedback_attachments_feedback ON public.external_feedback_attachments(feedback_id);

-- People in scope
CREATE OR REPLACE FUNCTION public.get_people_in_my_feedback_scope()
RETURNS TABLE(id text, nome text, sub_time text, cargo text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome, p.sub_time, p.cargo
  FROM public.people p
  WHERE p.ativo IS DISTINCT FROM false
    AND public.can_manage_person_feedback(p.id)
  ORDER BY p.nome;
$$;

REVOKE EXECUTE ON FUNCTION public.get_people_in_my_feedback_scope() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_people_in_my_feedback_scope() TO authenticated;

-- Unified feedback timeline
CREATE OR REPLACE FUNCTION public.get_person_feedback_timeline(p_person_id text, p_since timestamptz DEFAULT NULL)
RETURNS TABLE(
  id text,
  kind text,
  occurred_at timestamptz,
  author_label text,
  title text,
  content text,
  tag text,
  visible_to_subject boolean,
  attachments jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me text := public.current_person_id();
  v_can_manage boolean := public.can_manage_person_feedback(p_person_id);
BEGIN
  IF NOT v_can_manage AND v_me IS DISTINCT FROM p_person_id THEN
    RAISE EXCEPTION 'Sem permissão para ver feedbacks desta pessoa';
  END IF;

  RETURN QUERY
  -- Kudos received
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

  -- Peer review / pulse responses about this person
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

  -- External feedbacks
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
        'id', a.id, 'storage_path', a.storage_path, 'file_name', a.file_name, 'mime_type', a.mime_type
      ) ORDER BY a.created_at)
      FROM public.external_feedback_attachments a WHERE a.feedback_id = f.id
    ), '[]'::jsonb)
  FROM public.external_feedbacks f
  WHERE f.person_id = p_person_id
    AND (v_can_manage OR (f.visible_to_subject AND f.person_id = v_me))
    AND (p_since IS NULL OR f.feedback_date::timestamptz >= p_since)

  ORDER BY 3 DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_person_feedback_timeline(text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_person_feedback_timeline(text, timestamptz) TO authenticated;