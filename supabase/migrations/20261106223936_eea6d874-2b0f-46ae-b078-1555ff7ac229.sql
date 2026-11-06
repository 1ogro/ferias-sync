CREATE TABLE public.external_directors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  area text,
  whatsapp text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_by text REFERENCES public.people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_directors TO authenticated;
GRANT ALL ON public.external_directors TO service_role;
ALTER TABLE public.external_directors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leadership manages external directors" ON public.external_directors
  FOR ALL TO authenticated USING (public.is_admin_or_director()) WITH CHECK (public.is_admin_or_director());
CREATE TRIGGER trg_external_directors_updated BEFORE UPDATE ON public.external_directors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.leadership_report_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  scope text NOT NULL DEFAULT 'global',
  manager_person_id text REFERENCES public.people(id) ON DELETE CASCADE,
  recipient_person_id text REFERENCES public.people(id) ON DELETE SET NULL,
  external_director_id uuid REFERENCES public.external_directors(id) ON DELETE SET NULL,
  recipient_name text NOT NULL,
  recipient_phone text,
  channel text NOT NULL DEFAULT 'whatsapp',
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by text REFERENCES public.people(id) ON DELETE SET NULL,
  first_accessed_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.leadership_report_links TO authenticated;
GRANT ALL ON public.leadership_report_links TO service_role;
ALTER TABLE public.leadership_report_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leadership reads links" ON public.leadership_report_links
  FOR SELECT TO authenticated USING (public.is_admin_or_director());
CREATE POLICY "Leadership revokes links" ON public.leadership_report_links
  FOR UPDATE TO authenticated USING (public.is_admin_or_director()) WITH CHECK (public.is_admin_or_director());

CREATE OR REPLACE FUNCTION public.create_leadership_report_link(
  p_scope text, p_recipient_name text, p_manager_person_id text DEFAULT NULL,
  p_recipient_person_id text DEFAULT NULL, p_external_director_id uuid DEFAULT NULL,
  p_recipient_phone text DEFAULT NULL, p_channel text DEFAULT 'whatsapp', p_days integer DEFAULT 14)
RETURNS TABLE(id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.leadership_report_links;
BEGIN
  IF NOT public.is_admin_or_director() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_scope NOT IN ('global','team') THEN RAISE EXCEPTION 'Escopo inválido'; END IF;
  IF p_scope = 'team' AND p_manager_person_id IS NULL THEN RAISE EXCEPTION 'Informe o gestor'; END IF;
  IF length(trim(coalesce(p_recipient_name,''))) < 2 THEN RAISE EXCEPTION 'Informe o nome'; END IF;
  IF p_channel NOT IN ('whatsapp','slack') THEN RAISE EXCEPTION 'Canal inválido'; END IF;
  INSERT INTO public.leadership_report_links(scope, manager_person_id, recipient_person_id, external_director_id,
    recipient_name, recipient_phone, channel, expires_at, created_by)
  VALUES (p_scope, p_manager_person_id, p_recipient_person_id, p_external_director_id, trim(p_recipient_name),
    p_recipient_phone, p_channel, now() + make_interval(days => LEAST(GREATEST(coalesce(p_days,14),1),60)),
    public.current_person_id())
  RETURNING * INTO v_row;
  INSERT INTO public.audit_logs(entidade, entidade_id, acao, actor_id, payload)
  VALUES ('leadership_report_links', v_row.id::text, 'LINK_CREATED', public.current_person_id(),
    jsonb_build_object('scope', p_scope, 'recipient', v_row.recipient_name, 'channel', p_channel));
  RETURN QUERY SELECT v_row.id, v_row.token, v_row.expires_at;
END $$;
REVOKE EXECUTE ON FUNCTION public.create_leadership_report_link(text,text,text,text,uuid,text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_leadership_report_link(text,text,text,text,uuid,text,text,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_leadership_report(p_token text, p_month date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l public.leadership_report_links;
  v_mgr_team text;
  v_s timestamptz; v_e timestamptz;
  v_people jsonb; v_teams jsonb; v_well jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 20 THEN RAISE EXCEPTION 'Link inválido'; END IF;
  SELECT * INTO l FROM public.leadership_report_links WHERE token = p_token;
  IF NOT FOUND OR l.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Link inválido'; END IF;
  IF l.expires_at < now() THEN RAISE EXCEPTION 'Link expirado'; END IF;

  UPDATE public.leadership_report_links SET access_count = access_count + 1,
    last_accessed_at = now(), first_accessed_at = coalesce(first_accessed_at, now()) WHERE id = l.id;

  v_s := date_trunc('month', coalesce(p_month, current_date)::timestamptz);
  v_e := v_s + interval '1 month';
  SELECT sub_time INTO v_mgr_team FROM public.people WHERE id = l.manager_person_id;

  CREATE TEMP TABLE IF NOT EXISTS _lr_scope(id text, nome text, sub_time text, papel text) ON COMMIT DROP;
  TRUNCATE _lr_scope;
  INSERT INTO _lr_scope
  SELECT p.id, p.nome,
    CASE WHEN p.sub_time IS NOT NULL AND public.is_active_team(p.sub_time) THEN p.sub_time ELSE 'Sem time' END,
    coalesce(p.papel,'COLABORADOR')
  FROM public.people p
  WHERE p.ativo IS DISTINCT FROM false
    AND (l.scope = 'global' OR p.gestor_id = l.manager_person_id
         OR (v_mgr_team IS NOT NULL AND p.sub_time = v_mgr_team AND p.id <> l.manager_person_id));

  WITH pp AS (
    SELECT s.*,
      (SELECT count(*) FROM public.kudos k WHERE k.to_person_id = s.id AND k.created_at >= v_s AND k.created_at < v_e)::int kr,
      (SELECT count(*) FROM public.kudos k WHERE k.from_person_id = s.id AND k.created_at >= v_s AND k.created_at < v_e)::int kg,
      (SELECT count(DISTINCT r.run_id) FROM public.pulse_responses r WHERE r.subject_id = s.id AND r.submitted_at >= v_s AND r.submitted_at < v_e)::int pf,
      (SELECT count(*) FROM public.external_feedbacks f WHERE f.person_id = s.id AND f.feedback_date >= v_s::date AND f.feedback_date < v_e::date)::int ef,
      (SELECT coalesce(sum(e.points),0) FROM public.engagement_points e WHERE e.person_id = s.id AND e.created_at >= v_s AND e.created_at < v_e)::int pts
    FROM _lr_scope s
  )
  SELECT
    coalesce(jsonb_agg(jsonb_build_object('person_id', id, 'nome', nome, 'sub_time', sub_time, 'papel', papel,
      'kudos_received', kr, 'kudos_given', kg, 'peer_feedbacks', pf, 'external_feedbacks', ef, 'points', pts)
      ORDER BY pts DESC, nome), '[]'::jsonb)
  INTO v_people FROM pp;

  SELECT coalesce(jsonb_agg(t ORDER BY t->>'sub_time'), '[]'::jsonb) INTO v_teams FROM (
    SELECT jsonb_build_object('sub_time', x->>'sub_time', 'people_count', count(*),
      'kudos_received', sum((x->>'kudos_received')::int), 'kudos_given', sum((x->>'kudos_given')::int),
      'peer_feedbacks', sum((x->>'peer_feedbacks')::int), 'external_feedbacks', sum((x->>'external_feedbacks')::int),
      'points', sum((x->>'points')::int)) t
    FROM jsonb_array_elements(v_people) x GROUP BY x->>'sub_time') q;

  SELECT coalesce(jsonb_agg(jsonb_build_object('person_id', r.respondent_id, 'nome', s.nome, 'sub_time', s.sub_time,
      'survey', ps.title, 'question', q.question_text, 'dispatched_at', pr.dispatched_at,
      'submitted_at', r.submitted_at, 'scale_value', r.scale_value, 'text_value', r.text_value)
      ORDER BY s.nome, r.submitted_at DESC), '[]'::jsonb)
  INTO v_well
  FROM public.pulse_responses r
  JOIN _lr_scope s ON s.id = r.respondent_id
  JOIN public.pulse_runs pr ON pr.id = r.run_id
  JOIN public.pulse_surveys ps ON ps.id = pr.survey_id
  JOIN public.pulse_questions q ON q.id = r.question_id
  WHERE ps.kind = 'self' AND ps.anonymous = false
    AND r.submitted_at >= now() - interval '180 days';

  RETURN jsonb_build_object(
    'link', jsonb_build_object('recipient_name', l.recipient_name, 'scope', l.scope, 'expires_at', l.expires_at,
      'manager_name', (SELECT nome FROM public.people WHERE id = l.manager_person_id)),
    'month', to_char(v_s, 'YYYY-MM-DD'),
    'people', v_people, 'teams', v_teams, 'wellbeing', v_well);
END $$;
REVOKE EXECUTE ON FUNCTION public.get_leadership_report(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leadership_report(text, date) TO anon, authenticated, service_role;