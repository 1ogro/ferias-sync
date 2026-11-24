ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS overlap_alert_threshold integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS min_capacity_pct integer NOT NULL DEFAULT 70;

CREATE OR REPLACE FUNCTION public.validate_team_capacity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.overlap_alert_threshold < 1 OR NEW.overlap_alert_threshold > 50 THEN
    RAISE EXCEPTION 'Limite de ausências simultâneas deve estar entre 1 e 50';
  END IF;
  IF NEW.min_capacity_pct < 0 OR NEW.min_capacity_pct > 100 THEN
    RAISE EXCEPTION 'Capacidade mínima deve estar entre 0 e 100%%';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.validate_team_capacity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS validate_team_capacity_trg ON public.teams;
CREATE TRIGGER validate_team_capacity_trg BEFORE INSERT OR UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.validate_team_capacity();