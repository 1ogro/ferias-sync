-- Check if status enum already exists, if not create it
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status') THEN
        CREATE TYPE public.status AS ENUM (
            'PENDENTE',
            'EM_ANALISE_GESTOR', 
            'APROVADO_1NIVEL',
            'EM_ANALISE_DIRETOR',
            'APROVADO_FINAL',
            'REPROVADO',
            'CANCELADO',
            'REALIZADO',
            'EM_ANDAMENTO'
        );
    ELSE
        -- Add EM_ANDAMENTO if it doesn't exist
        BEGIN
            ALTER TYPE public.status ADD VALUE IF NOT EXISTS 'EM_ANDAMENTO';
        EXCEPTION
            WHEN duplicate_object THEN
                NULL; -- Value already exists, ignore
        END;
    END IF;
END $$;

-- Add data_contrato field to people table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'people' AND column_name = 'data_contrato') THEN
        ALTER TABLE public.people ADD COLUMN data_contrato DATE;
    END IF;
END $$;

-- Create vacation_balances table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.vacation_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  person_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  accrued_days INTEGER NOT NULL DEFAULT 0,
  used_days INTEGER NOT NULL DEFAULT 0,
  balance_days INTEGER NOT NULL DEFAULT 0,
  contract_anniversary DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(person_id, year)
);

-- Enable RLS on vacation_balances
ALTER TABLE public.vacation_balances ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
DROP POLICY IF EXISTS "Users can view their own vacation balances" ON public.vacation_balances;
DROP POLICY IF EXISTS "Admins can view all vacation balances" ON public.vacation_balances;
DROP POLICY IF EXISTS "Admins can manage vacation balances" ON public.vacation_balances;

-- RLS policies for vacation_balances
CREATE POLICY "Users can view their own vacation balances" 
ON public.vacation_balances 
FOR SELECT 
USING (person_id IN (SELECT profiles.person_id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Admins can view all vacation balances" 
ON public.vacation_balances 
FOR SELECT 
USING (is_current_user_admin());

CREATE POLICY "Admins can manage vacation balances" 
ON public.vacation_balances 
FOR ALL 
USING (is_current_user_admin());

-- Create trigger for automatic timestamp updates if it doesn't exist
DROP TRIGGER IF EXISTS update_vacation_balances_updated_at ON public.vacation_balances;
CREATE TRIGGER update_vacation_balances_updated_at
BEFORE UPDATE ON public.vacation_balances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();