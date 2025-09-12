-- Add foreign keys and column for relationships used by dashboards

-- 1) medical_leaves.person_id -> people.id
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_medical_leaves_person'
  ) THEN
    ALTER TABLE public.medical_leaves
    ADD CONSTRAINT fk_medical_leaves_person
    FOREIGN KEY (person_id)
    REFERENCES public.people(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;
  END IF;
END $$;

-- Link created_by to people as well
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_medical_leaves_created_by'
  ) THEN
    ALTER TABLE public.medical_leaves
    ADD CONSTRAINT fk_medical_leaves_created_by
    FOREIGN KEY (created_by)
    REFERENCES public.people(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;
  END IF;
END $$;

-- 2) team_capacity_alerts: add medical_leave_id column and FK to medical_leaves
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'team_capacity_alerts' AND column_name = 'medical_leave_id'
  ) THEN
    ALTER TABLE public.team_capacity_alerts
    ADD COLUMN medical_leave_id uuid;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_team_capacity_alerts_medical_leave'
  ) THEN
    ALTER TABLE public.team_capacity_alerts
    ADD CONSTRAINT fk_team_capacity_alerts_medical_leave
    FOREIGN KEY (medical_leave_id)
    REFERENCES public.medical_leaves(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL;
  END IF;
END $$;

-- 3) special_approvals: add FKs
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_special_approvals_request'
  ) THEN
    ALTER TABLE public.special_approvals
    ADD CONSTRAINT fk_special_approvals_request
    FOREIGN KEY (request_id)
    REFERENCES public.requests(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_special_approvals_medical_leave'
  ) THEN
    ALTER TABLE public.special_approvals
    ADD CONSTRAINT fk_special_approvals_medical_leave
    FOREIGN KEY (medical_leave_id)
    REFERENCES public.medical_leaves(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_special_approvals_manager'
  ) THEN
    ALTER TABLE public.special_approvals
    ADD CONSTRAINT fk_special_approvals_manager
    FOREIGN KEY (manager_id)
    REFERENCES public.people(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_special_approvals_director'
  ) THEN
    ALTER TABLE public.special_approvals
    ADD CONSTRAINT fk_special_approvals_director
    FOREIGN KEY (director_id)
    REFERENCES public.people(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL;
  END IF;
END $$;