
ALTER TABLE public.pending_people ALTER COLUMN gestor_id DROP NOT NULL;
ALTER TABLE public.pending_people ALTER COLUMN created_by DROP NOT NULL;

UPDATE public.pending_people pp SET gestor_id = NULL
WHERE gestor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.people p WHERE p.id = pp.gestor_id);

UPDATE public.pending_people pp SET created_by = NULL
WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.people p WHERE p.id = pp.created_by);

UPDATE public.pending_people pp SET reviewed_by = NULL
WHERE reviewed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.people p WHERE p.id = pp.reviewed_by);

ALTER TABLE public.pending_people
  ADD CONSTRAINT pending_people_gestor_id_fkey FOREIGN KEY (gestor_id) REFERENCES public.people(id) ON DELETE SET NULL,
  ADD CONSTRAINT pending_people_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.people(id) ON DELETE SET NULL,
  ADD CONSTRAINT pending_people_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.people(id) ON DELETE SET NULL;
