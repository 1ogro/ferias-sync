ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS solicita_13 boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_clt_vacation_benefits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_model text;
  v_days int;
  v_abono int := COALESCE(NEW.dias_abono, 0);
BEGIN
  IF NEW.is_historical THEN RETURN NEW; END IF;
  IF NEW.tipo <> 'FERIAS' THEN
    NEW.dias_abono := 0; NEW.solicita_13 := false; RETURN NEW;
  END IF;
  IF v_abono = 0 AND NOT NEW.solicita_13 THEN RETURN NEW; END IF;
  IF NEW.status IN ('CANCELADO','REPROVADO') THEN RETURN NEW; END IF;

  SELECT modelo_contrato INTO v_model FROM people WHERE id = NEW.requester_id;
  IF v_model IS NULL OR v_model NOT IN ('CLT','CLT_ABONO_LIVRE','CLT_ABONO_FIXO') THEN
    RAISE EXCEPTION 'Abono e adiantamento do 13º são exclusivos para colaboradores CLT.';
  END IF;

  IF v_abono < 0 OR v_abono > 10 THEN
    RAISE EXCEPTION 'O abono deve ser entre 0 e 10 dias.';
  END IF;
  IF v_model = 'CLT_ABONO_FIXO' AND v_abono NOT IN (0, 10) THEN
    RAISE EXCEPTION 'Para seu contrato, o abono deve ser de 0 ou 10 dias.';
  END IF;
  IF v_abono > 0 AND NEW.inicio IS NOT NULL AND NEW.fim IS NOT NULL THEN
    v_days := (NEW.fim - NEW.inicio) + 1;
    IF v_abono > v_days THEN
      RAISE EXCEPTION 'O abono não pode ser maior que o período de férias.';
    END IF;
  END IF;

  IF NEW.solicita_13 THEN
    IF NEW.inicio IS NULL OR EXTRACT(MONTH FROM NEW.inicio) NOT BETWEEN 2 AND 11 THEN
      RAISE EXCEPTION 'O adiantamento da 1ª parcela do 13º só pode ser solicitado para férias que começam entre fevereiro e novembro.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM requests r
      WHERE r.requester_id = NEW.requester_id AND r.id <> NEW.id
        AND r.solicita_13 AND r.tipo = 'FERIAS'
        AND r.status NOT IN ('CANCELADO','REPROVADO','RASCUNHO')
        AND EXTRACT(YEAR FROM r.inicio) = EXTRACT(YEAR FROM NEW.inicio)
    ) THEN
      RAISE EXCEPTION 'O adiantamento da 1ª parcela do 13º já foi solicitado neste ano.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.enforce_clt_vacation_benefits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_clt_vacation_benefits ON public.requests;
CREATE TRIGGER trg_enforce_clt_vacation_benefits
BEFORE INSERT OR UPDATE ON public.requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_clt_vacation_benefits();