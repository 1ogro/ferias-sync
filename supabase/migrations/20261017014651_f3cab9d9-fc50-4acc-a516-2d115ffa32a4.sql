ALTER TABLE public.people ADD COLUMN IF NOT EXISTS data_admissao date;
UPDATE public.people SET data_admissao = data_contrato WHERE data_admissao IS NULL AND data_contrato IS NOT NULL;

CREATE OR REPLACE FUNCTION public.default_data_admissao()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.data_admissao IS NULL AND NEW.data_contrato IS NOT NULL THEN
    NEW.data_admissao := NEW.data_contrato;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_default_data_admissao ON public.people;
CREATE TRIGGER trg_default_data_admissao BEFORE INSERT OR UPDATE ON public.people
FOR EACH ROW EXECUTE FUNCTION public.default_data_admissao();

CREATE OR REPLACE FUNCTION public.apply_admissao_on_data_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'APROVADO' AND OLD.status IS DISTINCT FROM 'APROVADO'
     AND NEW.kind = 'PROFILE_DATA' AND NEW.changes ? 'data_admissao' THEN
    UPDATE people SET data_admissao = NULLIF(NEW.changes->>'data_admissao','')::date, updated_at = now()
    WHERE id = NEW.person_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_admissao_on_data_change ON public.data_change_requests;
CREATE TRIGGER trg_apply_admissao_on_data_change AFTER UPDATE ON public.data_change_requests
FOR EACH ROW EXECUTE FUNCTION public.apply_admissao_on_data_change();