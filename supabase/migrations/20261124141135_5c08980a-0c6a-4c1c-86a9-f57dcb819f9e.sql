ALTER TABLE public.pending_people ADD COLUMN IF NOT EXISTS data_admissao date;

CREATE OR REPLACE FUNCTION public.propagate_pending_admissao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.data_admissao IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status
     AND upper(NEW.status) LIKE 'APROVAD%' AND NEW.email IS NOT NULL THEN
    UPDATE public.people SET data_admissao = NEW.data_admissao
    WHERE lower(email) = lower(NEW.email);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.propagate_pending_admissao() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_propagate_pending_admissao ON public.pending_people;
CREATE TRIGGER trg_propagate_pending_admissao AFTER UPDATE ON public.pending_people
FOR EACH ROW EXECUTE FUNCTION public.propagate_pending_admissao();