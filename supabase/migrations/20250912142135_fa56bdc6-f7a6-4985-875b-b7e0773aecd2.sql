-- Add foreign keys and column for relationships used by dashboards

-- 1) medical_leaves.person_id -> people.id
ALTER TABLE public.medical_leaves
ADD CONSTRAINT IF NOT EXISTS fk_medical_leaves_person
FOREIGN KEY (person_id)
REFERENCES public.people(id)
ON UPDATE CASCADE
ON DELETE RESTRICT;

-- Optionally link created_by to people as well (kept restrictive; column is NOT NULL)
ALTER TABLE public.medical_leaves
ADD CONSTRAINT IF NOT EXISTS fk_medical_leaves_created_by
FOREIGN KEY (created_by)
REFERENCES public.people(id)
ON UPDATE CASCADE
ON DELETE RESTRICT;

-- 2) team_capacity_alerts: add medical_leave_id column and FK to medical_leaves
ALTER TABLE public.team_capacity_alerts
ADD COLUMN IF NOT EXISTS medical_leave_id uuid;

ALTER TABLE public.team_capacity_alerts
ADD CONSTRAINT IF NOT EXISTS fk_team_capacity_alerts_medical_leave
FOREIGN KEY (medical_leave_id)
REFERENCES public.medical_leaves(id)
ON UPDATE CASCADE
ON DELETE SET NULL;

-- 3) special_approvals: add FKs
ALTER TABLE public.special_approvals
ADD CONSTRAINT IF NOT EXISTS fk_special_approvals_request
FOREIGN KEY (request_id)
REFERENCES public.requests(id)
ON UPDATE CASCADE
ON DELETE CASCADE;

ALTER TABLE public.special_approvals
ADD CONSTRAINT IF NOT EXISTS fk_special_approvals_medical_leave
FOREIGN KEY (medical_leave_id)
REFERENCES public.medical_leaves(id)
ON UPDATE CASCADE
ON DELETE CASCADE;

ALTER TABLE public.special_approvals
ADD CONSTRAINT IF NOT EXISTS fk_special_approvals_manager
FOREIGN KEY (manager_id)
REFERENCES public.people(id)
ON UPDATE CASCADE
ON DELETE RESTRICT;

ALTER TABLE public.special_approvals
ADD CONSTRAINT IF NOT EXISTS fk_special_approvals_director
FOREIGN KEY (director_id)
REFERENCES public.people(id)
ON UPDATE CASCADE
ON DELETE SET NULL;