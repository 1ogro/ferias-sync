-- Add abono support to vacation requests
ALTER TABLE public.requests 
ADD COLUMN dias_abono INTEGER DEFAULT 0 CHECK (dias_abono >= 0 AND dias_abono <= 10);

-- Add comment explaining the field
COMMENT ON COLUMN public.requests.dias_abono IS 'Number of vacation days sold (abono) - only for CLT contracts, 0-10 days allowed';

-- Update the check constraint to ensure abono is only used with vacation requests
ALTER TABLE public.requests 
ADD CONSTRAINT check_abono_only_with_vacation 
CHECK (
  (tipo != 'FERIAS' AND dias_abono = 0) OR 
  (tipo = 'FERIAS')
);