
ALTER TABLE public.pending_people DROP CONSTRAINT IF EXISTS pending_people_status_check;
ALTER TABLE public.pending_people ADD CONSTRAINT pending_people_status_check
  CHECK (status = ANY (ARRAY['PENDENTE'::text, 'APROVADO'::text, 'REJEITADO'::text, 'MERGED'::text]));

CREATE OR REPLACE FUNCTION public.merge_pending_into_person(_pending_id uuid, _person_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pending RECORD;
  _person RECORD;
BEGIN
  SELECT * INTO _pending FROM public.pending_people WHERE id = _pending_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'pending_people % not found', _pending_id; END IF;

  SELECT * INTO _person FROM public.people WHERE id = _person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'people % not found', _person_id; END IF;

  IF _pending.slack_user_id IS NOT NULL AND (_person.slack_user_id IS NULL OR _person.slack_user_id = '') THEN
    UPDATE public.people SET slack_user_id = _pending.slack_user_id WHERE id = _person_id;
  END IF;

  IF _pending.slack_user_id IS NOT NULL THEN
    UPDATE public.kudos SET to_person_id = _person_id, pending_to = false
      WHERE to_person_id IS NULL AND to_slack_user_id = _pending.slack_user_id;
    UPDATE public.kudos SET from_person_id = _person_id, pending_from = false
      WHERE from_person_id IS NULL AND from_slack_user_id = _pending.slack_user_id;
  END IF;

  UPDATE public.engagement_points SET person_id = _person_id
    WHERE person_id = _pending_id::text;

  UPDATE public.pending_people SET
    status = 'MERGED',
    reviewed_at = now(),
    director_notes = COALESCE(director_notes || E'\n', '') || 'auto-merge into ' || _person_id
  WHERE id = _pending_id;

  INSERT INTO public.audit_logs (acao, entidade, entidade_id, payload)
  VALUES (
    'PENDING_MERGED',
    'pending_people',
    _pending_id::text,
    jsonb_build_object(
      'person_id', _person_id,
      'pending_slack_user_id', _pending.slack_user_id,
      'pending_email', _pending.email,
      'pending_nome', _pending.nome
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_pending_into_person(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_pending_into_person(uuid, text) TO authenticated, service_role;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (pp.id) pp.id AS pending_id, p.id AS person_id
    FROM public.pending_people pp
    JOIN public.people p ON p.ativo AND (
      (pp.slack_user_id IS NOT NULL AND p.slack_user_id = pp.slack_user_id)
      OR (pp.email IS NOT NULL AND lower(p.email_pessoal) = lower(pp.email))
      OR (pp.email IS NOT NULL AND lower(p.email) = lower(pp.email))
    )
    WHERE pp.status <> 'MERGED'
  LOOP
    PERFORM public.merge_pending_into_person(r.pending_id, r.person_id);
  END LOOP;
END $$;
