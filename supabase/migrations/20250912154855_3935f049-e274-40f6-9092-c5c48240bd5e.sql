-- Add new columns to requests table for historical data tracking
ALTER TABLE public.requests 
ADD COLUMN is_historical boolean NOT NULL DEFAULT false,
ADD COLUMN original_created_at timestamp with time zone,
ADD COLUMN original_channel text,
ADD COLUMN admin_observations text;

-- Create index for historical requests for better performance
CREATE INDEX idx_requests_historical ON public.requests(is_historical);

-- Backfill historical flag based on audit logs
UPDATE public.requests 
SET is_historical = true 
WHERE id IN (
  SELECT entidade_id::uuid 
  FROM audit_logs 
  WHERE entidade = 'requests' 
  AND acao = 'HISTORICAL_CREATE'
);

-- Create a function to recalculate vacation balance automatically
CREATE OR REPLACE FUNCTION public.recalculate_vacation_balance(p_person_id text, p_year integer DEFAULT NULL)
RETURNS TABLE(
  person_id text,
  year integer,
  accrued_days integer,
  used_days integer,
  balance_days integer,
  contract_anniversary date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_year integer;
  contract_date date;
  years_worked integer;
  calculated_accrued integer;
  calculated_used integer;
  calculated_balance integer;
  anniversary_date date;
BEGIN
  -- Default to current year if not specified
  target_year := COALESCE(p_year, EXTRACT(year FROM now())::integer);
  
  -- Get person's contract date
  SELECT data_contrato INTO contract_date
  FROM people
  WHERE id = p_person_id;
  
  IF contract_date IS NULL THEN
    RAISE EXCEPTION 'Contract date not found for person %', p_person_id;
  END IF;
  
  -- Calculate anniversary date for the target year
  anniversary_date := DATE(target_year || '-' || EXTRACT(month FROM contract_date) || '-' || EXTRACT(day FROM contract_date));
  
  -- Calculate years worked
  years_worked := target_year - EXTRACT(year FROM contract_date)::integer;
  IF now() < anniversary_date AND target_year = EXTRACT(year FROM now())::integer THEN
    years_worked := greatest(0, years_worked - 1);
  END IF;
  
  -- Calculate accrued days (30 per year)
  calculated_accrued := greatest(0, years_worked * 30);
  
  -- Calculate used days from REALIZADO requests and APROVADO_FINAL requests with end date in the past
  SELECT COALESCE(SUM(
    CASE 
      WHEN inicio IS NULL OR fim IS NULL THEN 0
      ELSE (fim - inicio + 1)
    END
  ), 0) INTO calculated_used
  FROM requests
  WHERE requester_id = p_person_id
  AND tipo = 'FERIAS'
  AND (
    status = 'REALIZADO' 
    OR (status = 'APROVADO_FINAL' AND fim < now()::date)
  );
  
  -- Calculate balance
  calculated_balance := greatest(0, calculated_accrued - calculated_used);
  
  -- Return the calculated values
  RETURN QUERY SELECT 
    p_person_id,
    target_year,
    calculated_accrued,
    calculated_used,
    calculated_balance,
    anniversary_date;
END;
$$;