
-- 1) Backfill slack_user_id em people via kudos.to_slack_email/to_slack_user_id
--    (e from_*), quando email pessoal casa e a pessoa ainda não tem slack_user_id.
WITH slack_pairs AS (
  SELECT DISTINCT lower(to_slack_email) AS email, to_slack_user_id AS slack_id
    FROM public.kudos
   WHERE to_slack_email IS NOT NULL AND to_slack_user_id IS NOT NULL
  UNION
  SELECT DISTINCT lower(from_slack_email), from_slack_user_id
    FROM public.kudos
   WHERE from_slack_email IS NOT NULL AND from_slack_user_id IS NOT NULL
  UNION
  SELECT DISTINCT lower(email), slack_user_id
    FROM public.pending_people
   WHERE email IS NOT NULL AND slack_user_id IS NOT NULL
)
UPDATE public.people p
   SET slack_user_id = sp.slack_id
  FROM slack_pairs sp
 WHERE p.slack_user_id IS NULL
   AND p.ativo = true
   AND (lower(p.email) = sp.email OR lower(p.email_pessoal) = sp.email);

-- 2) Migra kudos pendentes cujo email do Slack casa com email/email_pessoal de uma pessoa ativa.
WITH to_matches AS (
  SELECT k.id AS kudo_id, p.id AS person_id
    FROM public.kudos k
    JOIN public.people p
      ON p.ativo = true
     AND (lower(p.email) = lower(k.to_slack_email)
          OR lower(p.email_pessoal) = lower(k.to_slack_email))
   WHERE k.pending_to = true
     AND k.to_slack_email IS NOT NULL
), from_matches AS (
  SELECT k.id AS kudo_id, p.id AS person_id
    FROM public.kudos k
    JOIN public.people p
      ON p.ativo = true
     AND (lower(p.email) = lower(k.from_slack_email)
          OR lower(p.email_pessoal) = lower(k.from_slack_email))
   WHERE k.pending_from = true
     AND k.from_slack_email IS NOT NULL
), audit_to AS (
  INSERT INTO public.audit_logs (entidade, entidade_id, acao, payload)
  SELECT 'kudos', tm.kudo_id, 'PENDING_MERGE',
         jsonb_build_object('field','to_person_id','person_id', tm.person_id, 'reason','slack_email_matched_email_pessoal')
    FROM to_matches tm
  RETURNING 1
), audit_from AS (
  INSERT INTO public.audit_logs (entidade, entidade_id, acao, payload)
  SELECT 'kudos', fm.kudo_id, 'PENDING_MERGE',
         jsonb_build_object('field','from_person_id','person_id', fm.person_id, 'reason','slack_email_matched_email_pessoal')
    FROM from_matches fm
  RETURNING 1
), upd_to AS (
  UPDATE public.kudos k
     SET to_person_id = tm.person_id,
         pending_to = false
    FROM to_matches tm
   WHERE k.id = tm.kudo_id
  RETURNING k.id
), upd_from AS (
  UPDATE public.kudos k
     SET from_person_id = fm.person_id,
         pending_from = false
    FROM from_matches fm
   WHERE k.id = fm.kudo_id
  RETURNING k.id
), award_received AS (
  SELECT public.award_points(tm.person_id, 10, 'kudo_received'::engagement_reason, tm.kudo_id::text)
    FROM to_matches tm
), award_given AS (
  SELECT public.award_points(fm.person_id, 2, 'kudo_given'::engagement_reason, fm.kudo_id::text)
    FROM from_matches fm
)
SELECT (SELECT count(*) FROM upd_to) AS updated_to,
       (SELECT count(*) FROM upd_from) AS updated_from;

-- 3) Consolida pending_people cujo email ou slack_user_id já correspondem a uma pessoa ativa.
WITH matches AS (
  SELECT pp.id AS pending_id, p.id AS person_id
    FROM public.pending_people pp
    JOIN public.people p
      ON p.ativo = true
     AND (
          (pp.slack_user_id IS NOT NULL AND p.slack_user_id = pp.slack_user_id)
          OR (pp.email IS NOT NULL AND lower(p.email) = lower(pp.email))
          OR (pp.email IS NOT NULL AND lower(p.email_pessoal) = lower(pp.email))
     )
   WHERE pp.status = 'PENDENTE'
), audit_pp AS (
  INSERT INTO public.audit_logs (entidade, entidade_id, acao, payload)
  SELECT 'pending_people', m.pending_id::uuid, 'PENDING_MERGE_CLEANUP',
         jsonb_build_object('merged_into_person', m.person_id)
    FROM matches m
  RETURNING 1
)
UPDATE public.pending_people pp
   SET status = 'REJEITADO',
       rejection_reason = 'merged_into_person:' || m.person_id,
       reviewed_at = now()
  FROM matches m
 WHERE pp.id = m.pending_id;
