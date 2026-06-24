
-- =========================
-- ENGAJAMENTO DO TIME
-- =========================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.kudos_category AS ENUM ('teamwork','innovation','delivery','leadership','customer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.engagement_reason AS ENUM ('pulse_response','kudo_received','kudo_given','streak','peer_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pulse_tone AS ENUM ('formal','neutral','casual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pulse_kind AS ENUM ('self','peer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================
-- kudos
-- =========================
CREATE TABLE public.kudos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_person_id text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  to_person_id text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 500),
  category public.kudos_category NOT NULL DEFAULT 'teamwork',
  slack_channel_posted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_person_id <> to_person_id)
);
CREATE INDEX idx_kudos_to ON public.kudos(to_person_id, created_at DESC);
CREATE INDEX idx_kudos_from ON public.kudos(from_person_id, created_at DESC);
CREATE INDEX idx_kudos_created ON public.kudos(created_at DESC);

GRANT SELECT, INSERT ON public.kudos TO authenticated;
GRANT ALL ON public.kudos TO service_role;
ALTER TABLE public.kudos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read all kudos"
  ON public.kudos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users insert their own kudos"
  ON public.kudos FOR INSERT TO authenticated
  WITH CHECK (from_person_id = public.current_person_id());

-- =========================
-- engagement_points
-- =========================
CREATE TABLE public.engagement_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  points integer NOT NULL,
  reason public.engagement_reason NOT NULL,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_points_person_created ON public.engagement_points(person_id, created_at DESC);
CREATE UNIQUE INDEX idx_points_unique_source ON public.engagement_points(person_id, reason, source_id)
  WHERE source_id IS NOT NULL;

GRANT SELECT ON public.engagement_points TO authenticated;
GRANT ALL ON public.engagement_points TO service_role;
ALTER TABLE public.engagement_points ENABLE ROW LEVEL SECURITY;

-- Semi-public: own points, same-team mates, manager and director/admin
CREATE POLICY "Read engagement points (semi-public)"
  ON public.engagement_points FOR SELECT TO authenticated
  USING (
    person_id = public.current_person_id()
    OR public.is_admin_or_director()
    OR EXISTS (
      SELECT 1 FROM public.people me, public.people target
      WHERE me.id = public.current_person_id()
        AND target.id = engagement_points.person_id
        AND (
          target.gestor_id = me.id                          -- I'm their manager
          OR (me.sub_time IS NOT NULL AND me.sub_time = target.sub_time)  -- same team
        )
    )
  );

-- =========================
-- peer_review_pairs
-- =========================
CREATE TABLE public.peer_review_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.pulse_surveys(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.pulse_runs(id) ON DELETE CASCADE,
  reviewer_id text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  subject_id text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (run_id, reviewer_id, subject_id),
  CHECK (reviewer_id <> subject_id)
);
CREATE INDEX idx_peer_pairs_run ON public.peer_review_pairs(run_id);
CREATE INDEX idx_peer_pairs_reviewer ON public.peer_review_pairs(reviewer_id, completed_at);

GRANT SELECT ON public.peer_review_pairs TO authenticated;
GRANT ALL ON public.peer_review_pairs TO service_role;
ALTER TABLE public.peer_review_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviewer reads own pairs"
  ON public.peer_review_pairs FOR SELECT TO authenticated
  USING (
    reviewer_id = public.current_person_id()
    OR subject_id = public.current_person_id()
    OR public.is_admin_or_director()
    OR EXISTS (
      SELECT 1 FROM public.people p
      WHERE p.id = peer_review_pairs.subject_id
        AND p.gestor_id = public.current_person_id()
    )
  );

-- =========================
-- pulse_surveys new columns
-- =========================
ALTER TABLE public.pulse_surveys
  ADD COLUMN IF NOT EXISTS tone public.pulse_tone NOT NULL DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS kind public.pulse_kind NOT NULL DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS peer_anonymous boolean NOT NULL DEFAULT true;

-- =========================
-- notification_preferences quiet/preferred windows
-- =========================
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_start time NOT NULL DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end time NOT NULL DEFAULT '14:00',
  ADD COLUMN IF NOT EXISTS preferred_window_start time NOT NULL DEFAULT '10:00',
  ADD COLUMN IF NOT EXISTS preferred_window_end time NOT NULL DEFAULT '11:00',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

-- =========================
-- award_points SECURITY DEFINER
-- =========================
CREATE OR REPLACE FUNCTION public.award_points(
  p_person_id text,
  p_points integer,
  p_reason public.engagement_reason,
  p_source_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.engagement_points (person_id, points, reason, source_id)
  VALUES (p_person_id, p_points, p_reason, p_source_id)
  ON CONFLICT (person_id, reason, source_id) WHERE source_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_points(text, integer, public.engagement_reason, text) TO authenticated, service_role;

-- =========================
-- leaderboard
-- =========================
CREATE OR REPLACE FUNCTION public.get_engagement_leaderboard(
  p_scope text DEFAULT 'team',  -- 'team' or 'global'
  p_period text DEFAULT 'month' -- 'month' or 'all'
) RETURNS TABLE(person_id text, nome text, sub_time text, total_points bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id text;
  v_caller_team text;
  v_is_admin_dir boolean;
  v_since timestamptz;
BEGIN
  v_caller_id := public.current_person_id();
  v_is_admin_dir := public.is_admin_or_director();

  SELECT p.sub_time INTO v_caller_team FROM public.people p WHERE p.id = v_caller_id;

  v_since := CASE WHEN p_period = 'month'
    THEN date_trunc('month', now())
    ELSE '1970-01-01'::timestamptz END;

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
$$;
GRANT EXECUTE ON FUNCTION public.get_engagement_leaderboard(text, text) TO authenticated, service_role;

-- Realtime for kudos and points
ALTER PUBLICATION supabase_realtime ADD TABLE public.kudos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.engagement_points;
