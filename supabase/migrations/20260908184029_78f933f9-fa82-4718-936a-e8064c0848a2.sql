CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX teams_nome_lower_idx ON public.teams (lower(nome));

GRANT SELECT ON public.teams TO authenticated;
GRANT INSERT, UPDATE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read teams" ON public.teams
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Management can create teams" ON public.teams
FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_director() OR public.is_manager_level());

CREATE POLICY "Management can update teams" ON public.teams
FOR UPDATE TO authenticated
USING (public.is_admin_or_director() OR public.is_manager_level())
WITH CHECK (public.is_admin_or_director() OR public.is_manager_level());

CREATE TRIGGER update_teams_updated_at
BEFORE UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Correção do nome digitado errado
UPDATE public.people SET sub_time = 'Assistencial/Médico/Operadoras'
WHERE sub_time = 'Asssistencial/Medico/Operadoras';
UPDATE public.pending_people SET sub_time = 'Assistencial/Médico/Operadoras'
WHERE sub_time = 'Asssistencial/Medico/Operadoras';

-- Popular a lista com os times existentes
INSERT INTO public.teams (nome)
SELECT DISTINCT btrim(sub_time) FROM (
  SELECT sub_time FROM public.people WHERE sub_time IS NOT NULL AND btrim(sub_time) <> ''
  UNION
  SELECT sub_time FROM public.pending_people WHERE sub_time IS NOT NULL AND btrim(sub_time) <> ''
) s
ON CONFLICT DO NOTHING;

-- Validação: só aceitar times cadastrados
CREATE OR REPLACE FUNCTION public.validate_sub_time()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.sub_time IS NOT NULL AND btrim(NEW.sub_time) <> '' THEN
    NEW.sub_time := btrim(NEW.sub_time);
    IF NOT EXISTS (SELECT 1 FROM public.teams t WHERE lower(t.nome) = lower(NEW.sub_time)) THEN
      RAISE EXCEPTION 'Time "%" não está cadastrado na lista de times', NEW.sub_time;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_people_sub_time
BEFORE INSERT OR UPDATE OF sub_time ON public.people
FOR EACH ROW EXECUTE FUNCTION public.validate_sub_time();

CREATE TRIGGER validate_pending_people_sub_time
BEFORE INSERT OR UPDATE OF sub_time ON public.pending_people
FOR EACH ROW EXECUTE FUNCTION public.validate_sub_time();

INSERT INTO public.audit_logs (entidade, entidade_id, acao, payload)
VALUES ('teams', 'bootstrap', 'PADRONIZACAO_TIMES',
  jsonb_build_object('merged', 'Asssistencial/Medico/Operadoras -> Assistencial/Médico/Operadoras'));