-- Extend TipoAusencia enum to include medical leave
ALTER TYPE "TipoAusencia" ADD VALUE 'LICENCA_MEDICA';

-- Create medical_leaves table
CREATE TABLE public.medical_leaves (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    person_id TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'ATIVA',
    created_by TEXT NOT NULL, -- director who registered
    justification TEXT,
    affects_team_capacity BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create team_capacity_alerts table
CREATE TABLE public.team_capacity_alerts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    team_id TEXT NOT NULL, -- sub_time
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    medical_leave_person_id TEXT NOT NULL,
    affected_people_count INTEGER NOT NULL DEFAULT 0,
    alert_status TEXT NOT NULL DEFAULT 'ACTIVE',
    director_notified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create special_approvals table
CREATE TABLE public.special_approvals (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    request_id UUID NOT NULL,
    medical_leave_id UUID NOT NULL,
    manager_id TEXT NOT NULL,
    director_id TEXT,
    manager_approval_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    director_notification_date TIMESTAMP WITH TIME ZONE,
    justification TEXT NOT NULL,
    approved_despite_medical_leave BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.medical_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_capacity_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_approvals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for medical_leaves
CREATE POLICY "Directors can manage medical leaves" 
ON public.medical_leaves 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 
        FROM profiles prof
        JOIN people per ON prof.person_id = per.id
        WHERE prof.user_id = auth.uid() 
        AND per.papel IN ('DIRETOR', 'ADMIN')
    )
);

CREATE POLICY "Users can view medical leaves in their team" 
ON public.medical_leaves 
FOR SELECT 
USING (
    person_id IN (
        SELECT p.id
        FROM people p
        JOIN profiles prof ON prof.person_id = p.gestor_id
        WHERE prof.user_id = auth.uid()
    )
    OR 
    EXISTS (
        SELECT 1 
        FROM profiles prof
        JOIN people per ON prof.person_id = per.id
        WHERE prof.user_id = auth.uid() 
        AND per.papel IN ('DIRETOR', 'ADMIN')
    )
);

-- RLS Policies for team_capacity_alerts
CREATE POLICY "Directors and managers can view capacity alerts" 
ON public.team_capacity_alerts 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 
        FROM profiles prof
        JOIN people per ON prof.person_id = per.id
        WHERE prof.user_id = auth.uid() 
        AND (per.papel IN ('DIRETOR', 'ADMIN') OR per.sub_time = team_id)
    )
);

CREATE POLICY "System can manage capacity alerts" 
ON public.team_capacity_alerts 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 
        FROM profiles prof
        JOIN people per ON prof.person_id = per.id
        WHERE prof.user_id = auth.uid() 
        AND per.papel IN ('DIRETOR', 'ADMIN')
    )
);

-- RLS Policies for special_approvals
CREATE POLICY "Managers and directors can view special approvals" 
ON public.special_approvals 
FOR SELECT 
USING (
    manager_id IN (
        SELECT profiles.person_id
        FROM profiles
        WHERE profiles.user_id = auth.uid()
    )
    OR 
    EXISTS (
        SELECT 1 
        FROM profiles prof
        JOIN people per ON prof.person_id = per.id
        WHERE prof.user_id = auth.uid() 
        AND per.papel IN ('DIRETOR', 'ADMIN')
    )
);

CREATE POLICY "Managers can create special approvals" 
ON public.special_approvals 
FOR INSERT 
WITH CHECK (
    manager_id IN (
        SELECT profiles.person_id
        FROM profiles
        WHERE profiles.user_id = auth.uid()
    )
);

-- Add triggers for updated_at
CREATE TRIGGER update_medical_leaves_updated_at
    BEFORE UPDATE ON public.medical_leaves
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for performance
CREATE INDEX idx_medical_leaves_person_dates ON public.medical_leaves (person_id, start_date, end_date);
CREATE INDEX idx_medical_leaves_active ON public.medical_leaves (status, start_date, end_date) WHERE status = 'ATIVA';
CREATE INDEX idx_team_capacity_alerts_team_period ON public.team_capacity_alerts (team_id, period_start, period_end);
CREATE INDEX idx_special_approvals_request ON public.special_approvals (request_id);
CREATE INDEX idx_special_approvals_medical_leave ON public.special_approvals (medical_leave_id);