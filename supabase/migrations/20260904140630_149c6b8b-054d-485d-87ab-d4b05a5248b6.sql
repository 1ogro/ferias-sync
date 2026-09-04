-- Settings (single row)
CREATE TABLE public.feedback_reminder_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT true,
  cycle_days integer NOT NULL DEFAULT 15,
  overdue_days integer NOT NULL DEFAULT 45,
  nudge_after_days integer NOT NULL DEFAULT 3,
  max_nudges integer NOT NULL DEFAULT 2,
  send_hour integer NOT NULL DEFAULT 9,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  updated_by text REFERENCES public.people(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.feedback_reminder_settings TO authenticated;
GRANT UPDATE, INSERT ON public.feedback_reminder_settings TO authenticated;
GRANT ALL ON public.feedback_reminder_settings TO service_role;

ALTER TABLE public.feedback_reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Management can read feedback reminder settings"
  ON public.feedback_reminder_settings FOR SELECT TO authenticated
  USING (public.is_manager_level());

CREATE POLICY "Admins and directors manage feedback reminder settings"
  ON public.feedback_reminder_settings FOR UPDATE TO authenticated
  USING (public.is_admin_or_director()) WITH CHECK (public.is_admin_or_director());

CREATE POLICY "Admins and directors create feedback reminder settings"
  ON public.feedback_reminder_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_director());

CREATE TRIGGER trg_feedback_reminder_settings_updated_at
  BEFORE UPDATE ON public.feedback_reminder_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.feedback_reminder_settings (enabled) VALUES (true);

-- Cycles
CREATE TABLE public.feedback_reminder_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_start date NOT NULL,
  manager_id text NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  pending_never integer NOT NULL DEFAULT 0,
  pending_overdue integer NOT NULL DEFAULT 0,
  nudges_sent integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz,
  resolved_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_start, manager_id)
);

GRANT SELECT ON public.feedback_reminder_cycles TO authenticated;
GRANT ALL ON public.feedback_reminder_cycles TO service_role;

ALTER TABLE public.feedback_reminder_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read own feedback reminder cycles"
  ON public.feedback_reminder_cycles FOR SELECT TO authenticated
  USING (public.is_admin_or_director() OR manager_id = public.current_person_id());

CREATE TRIGGER trg_feedback_reminder_cycles_updated_at
  BEFORE UPDATE ON public.feedback_reminder_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Notification preferences
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS feedback_reminders_slack boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS feedback_reminders_email boolean NOT NULL DEFAULT true;

-- Pending feedback collection per manager
CREATE OR REPLACE FUNCTION public.get_feedback_collection_pending(p_overdue_days integer DEFAULT 45)
RETURNS TABLE (
  manager_id text,
  manager_name text,
  manager_email text,
  person_id text,
  person_name text,
  last_feedback_at timestamptz,
  bucket text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pairs AS (
    -- direct reports
    SELECT m.id AS manager_id, m.nome AS manager_name, m.email AS manager_email,
           p.id AS person_id, p.nome AS person_name
    FROM public.people p
    JOIN public.people m ON m.id = p.gestor_id
    WHERE p.ativo IS DISTINCT FROM false
      AND m.ativo IS DISTINCT FROM false
      AND p.id <> m.id
    UNION
    -- gerente do sub_time
    SELECT g.id, g.nome, g.email, p.id, p.nome
    FROM public.people g
    JOIN public.people p
      ON p.sub_time IS NOT DISTINCT FROM g.sub_time
    WHERE g.papel = 'GERENTE'
      AND g.ativo IS DISTINCT FROM false
      AND g.sub_time IS NOT NULL
      AND p.ativo IS DISTINCT FROM false
      AND p.id <> g.id
  ), last_fb AS (
    SELECT ef.author_id, ef.person_id, max(ef.created_at) AS last_at
    FROM public.external_feedbacks ef
    GROUP BY 1, 2
  )
  SELECT pr.manager_id, pr.manager_name, pr.manager_email, pr.person_id, pr.person_name,
         lf.last_at,
         CASE WHEN lf.last_at IS NULL THEN 'never' ELSE 'overdue' END AS bucket
  FROM pairs pr
  LEFT JOIN last_fb lf ON lf.author_id = pr.manager_id AND lf.person_id = pr.person_id
  WHERE lf.last_at IS NULL
     OR lf.last_at < now() - make_interval(days => GREATEST(p_overdue_days, 1))
  ORDER BY pr.manager_name, bucket, pr.person_name;
$$;

REVOKE ALL ON FUNCTION public.get_feedback_collection_pending(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feedback_collection_pending(integer) TO authenticated, service_role;