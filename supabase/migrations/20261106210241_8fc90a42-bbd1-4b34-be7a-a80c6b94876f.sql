INSERT INTO public.system_settings(key, value) VALUES
 ('vacation_advance_days_clt','30'::jsonb),
 ('vacation_advance_days_pj','15'::jsonb),
 ('vacation_min_gap_days','15'::jsonb)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_vacation_min_days()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_min int; v_days int; v_adv int; v_gap int; v_model text; v_today date; v_conf record;
BEGIN
  IF NEW.tipo <> 'FERIAS' OR NEW.inicio IS NULL OR NEW.fim IS NULL OR COALESCE(NEW.is_historical,false) THEN RETURN NEW; END IF;
  IF NEW.status IN ('CANCELADO','REPROVADO') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.inicio IS NOT DISTINCT FROM OLD.inicio AND NEW.fim IS NOT DISTINCT FROM OLD.fim THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR public.is_admin_or_director() THEN RETURN NEW; END IF;

  SELECT COALESCE((value)::text::int, 0) INTO v_min FROM public.system_settings WHERE key = 'vacation_min_days';
  v_days := (NEW.fim - NEW.inicio) + 1;
  IF COALESCE(v_min,0) > 0 AND v_days < v_min THEN
    RAISE EXCEPTION 'O período mínimo de férias é de % dias. Você selecionou % dia(s).', v_min, v_days;
  END IF;

  SELECT modelo_contrato INTO v_model FROM public.people WHERE id = NEW.requester_id;
  SELECT COALESCE((value)::text::int, 0) INTO v_adv FROM public.system_settings
   WHERE key = CASE WHEN COALESCE(v_model,'') LIKE 'CLT%' THEN 'vacation_advance_days_clt' ELSE 'vacation_advance_days_pj' END;
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  IF COALESCE(v_adv,0) > 0 AND (NEW.inicio - v_today) < v_adv THEN
    RAISE EXCEPTION 'Férias precisam ser pedidas com pelo menos % dias de antecedência (início a partir de %).', v_adv, to_char(v_today + v_adv, 'DD/MM/YYYY');
  END IF;

  SELECT COALESCE((value)::text::int, 0) INTO v_gap FROM public.system_settings WHERE key = 'vacation_min_gap_days';
  IF COALESCE(v_gap,0) > 0 THEN
    SELECT r.inicio, r.fim INTO v_conf FROM public.requests r
     WHERE r.requester_id = NEW.requester_id AND r.tipo = 'FERIAS' AND r.id <> NEW.id
       AND r.status NOT IN ('CANCELADO','REPROVADO') AND r.inicio IS NOT NULL AND r.fim IS NOT NULL
       AND r.fim >= NEW.inicio - v_gap AND r.inicio <= NEW.fim + v_gap
       AND NOT (r.inicio <= NEW.fim AND r.fim >= NEW.inicio)
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'É preciso um intervalo mínimo de % dias entre períodos de férias (conflito com % a %).', v_gap, to_char(v_conf.inicio,'DD/MM/YYYY'), to_char(v_conf.fim,'DD/MM/YYYY');
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_vacation_min_days() FROM PUBLIC, anon, authenticated;