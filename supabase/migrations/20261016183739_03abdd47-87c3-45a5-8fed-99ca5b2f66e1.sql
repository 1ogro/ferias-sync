ALTER TABLE public.pulse_surveys
  ADD COLUMN IF NOT EXISTS evaluation_format text,
  ADD COLUMN IF NOT EXISTS contract_filter text NOT NULL DEFAULT 'all';
ALTER TABLE public.pulse_questions ADD COLUMN IF NOT EXISTS criteria_level text;
ALTER TABLE public.peer_review_pairs ADD COLUMN IF NOT EXISTS dimension text;

CREATE OR REPLACE FUNCTION public.validate_evaluation_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME='pulse_surveys' THEN
    IF NEW.evaluation_format IS NOT NULL AND NEW.evaluation_format NOT IN ('90','180','270') THEN RAISE EXCEPTION 'Formato de avaliação inválido'; END IF;
    IF NEW.contract_filter NOT IN ('all','clt','pj') THEN RAISE EXCEPTION 'Filtro de contrato inválido'; END IF;
  ELSIF TG_TABLE_NAME='pulse_questions' THEN
    IF NEW.criteria_level IS NOT NULL AND NEW.criteria_level NOT IN ('colaborador','gestor','diretor') THEN RAISE EXCEPTION 'Nível de critério inválido'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_eval_survey ON public.pulse_surveys;
CREATE TRIGGER trg_validate_eval_survey BEFORE INSERT OR UPDATE ON public.pulse_surveys FOR EACH ROW EXECUTE FUNCTION public.validate_evaluation_fields();
DROP TRIGGER IF EXISTS trg_validate_eval_question ON public.pulse_questions;
CREATE TRIGGER trg_validate_eval_question BEFORE INSERT OR UPDATE ON public.pulse_questions FOR EACH ROW EXECUTE FUNCTION public.validate_evaluation_fields();

CREATE OR REPLACE FUNCTION public.evaluation_level(_papel text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE WHEN _papel='DIRETOR' THEN 'diretor' WHEN _papel IN ('GESTOR','GERENTE') THEN 'gestor' ELSE 'colaborador' END
$$;

CREATE OR REPLACE FUNCTION public.can_view_evaluation(_survey_id uuid, _subject_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin_or_director()
    OR EXISTS(SELECT 1 FROM public.pulse_surveys s WHERE s.id=_survey_id AND s.created_by=public.current_person_id())
    OR public.can_manage_person_feedback(_subject_id))
$$;

CREATE OR REPLACE FUNCTION public.get_evaluation_matrix(p_survey_id uuid, p_run_id uuid DEFAULT NULL)
RETURNS TABLE(subject_id text, subject_nome text, sub_time text, papel text, modelo_contrato text,
  question_id uuid, question_text text, question_position int, dimension text, avg_score numeric, n_scores int,
  pairs_total int, pairs_done int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  RETURN QUERY
  WITH pr AS (
    SELECT p.* FROM public.peer_review_pairs p
    WHERE p.survey_id=p_survey_id AND p.dimension IS NOT NULL AND (p_run_id IS NULL OR p.run_id=p_run_id)
      AND public.can_view_evaluation(p_survey_id, p.subject_id)
  ), counts AS (
    SELECT pr.subject_id sid, pr.dimension dim, count(*)::int tot, count(pr.completed_at)::int done FROM pr GROUP BY 1,2
  ), scores AS (
    SELECT pr.subject_id sid, pr.dimension dim, r.question_id qid, avg(r.scale_value)::numeric(4,2) av, count(*)::int n
    FROM pr JOIN public.pulse_responses r ON r.run_id=pr.run_id AND r.respondent_id=pr.reviewer_id AND r.subject_id=pr.subject_id
    WHERE r.scale_value IS NOT NULL GROUP BY 1,2,3
  )
  SELECT c.sid, pe.nome, pe.sub_time, pe.papel, pe.modelo_contrato,
    s.qid, q.question_text, q.position, c.dim, s.av, coalesce(s.n,0), c.tot, c.done
  FROM counts c JOIN public.people pe ON pe.id=c.sid
  LEFT JOIN scores s ON s.sid=c.sid AND s.dim=c.dim
  LEFT JOIN public.pulse_questions q ON q.id=s.qid;
END $$;

CREATE OR REPLACE FUNCTION public.get_evaluation_comments(p_survey_id uuid, p_subject_id text, p_run_id uuid DEFAULT NULL)
RETURNS TABLE(dimension text, author_label text, question_text text, text_value text, submitted_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.can_view_evaluation(p_survey_id, p_subject_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  SELECT pr.dimension,
    CASE WHEN pr.dimension='peer' AND s.peer_anonymous THEN 'Par anônimo' ELSE coalesce(rp.nome,'—') END,
    q.question_text, r.text_value, r.submitted_at
  FROM public.peer_review_pairs pr
  JOIN public.pulse_surveys s ON s.id=pr.survey_id
  JOIN public.pulse_responses r ON r.run_id=pr.run_id AND r.respondent_id=pr.reviewer_id AND r.subject_id=pr.subject_id
  JOIN public.pulse_questions q ON q.id=r.question_id
  LEFT JOIN public.people rp ON rp.id=pr.reviewer_id
  WHERE pr.survey_id=p_survey_id AND pr.subject_id=p_subject_id AND pr.dimension IS NOT NULL
    AND (p_run_id IS NULL OR pr.run_id=p_run_id) AND r.text_value IS NOT NULL
  ORDER BY pr.dimension, r.submitted_at;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_evaluation_matrix(uuid,uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_evaluation_comments(uuid,text,uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_view_evaluation(uuid,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_evaluation_matrix(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_evaluation_comments(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_evaluation(uuid,text) TO authenticated;