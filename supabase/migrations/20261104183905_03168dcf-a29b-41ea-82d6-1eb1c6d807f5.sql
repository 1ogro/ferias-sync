CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by text REFERENCES public.people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_settings TO authenticated;
GRANT INSERT, UPDATE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read settings" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert settings" ON public.system_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_director());
CREATE POLICY "Admins update settings" ON public.system_settings FOR UPDATE TO authenticated USING (public.is_admin_or_director()) WITH CHECK (public.is_admin_or_director());
CREATE TRIGGER trg_system_settings_updated BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.system_settings(key, value) VALUES ('vacation_min_days', '5'::jsonb) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_vacation_min_days()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_min int; v_days int;
BEGIN
  IF NEW.tipo <> 'FERIAS' OR NEW.inicio IS NULL OR NEW.fim IS NULL OR COALESCE(NEW.is_historical,false) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.inicio IS NOT DISTINCT FROM OLD.inicio AND NEW.fim IS NOT DISTINCT FROM OLD.fim THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR public.is_admin_or_director() THEN RETURN NEW; END IF;
  SELECT COALESCE((value)::text::int, 0) INTO v_min FROM public.system_settings WHERE key = 'vacation_min_days';
  v_days := (NEW.fim - NEW.inicio) + 1;
  IF v_min > 0 AND v_days < v_min THEN
    RAISE EXCEPTION 'O período mínimo de férias é de % dias. Você selecionou % dia(s).', v_min, v_days;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_vacation_min_days() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_enforce_vacation_min_days BEFORE INSERT OR UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.enforce_vacation_min_days();