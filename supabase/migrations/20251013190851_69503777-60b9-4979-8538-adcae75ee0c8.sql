-- Add LICENCA_MATERNIDADE to TipoAusencia enum
ALTER TYPE "TipoAusencia" ADD VALUE IF NOT EXISTS 'LICENCA_MATERNIDADE';

-- Add maternity leave specific fields to requests table
ALTER TABLE requests 
ADD COLUMN IF NOT EXISTS data_prevista_parto date,
ADD COLUMN IF NOT EXISTS is_contract_exception boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS contract_exception_justification text;

-- Add maternity extension field to people table
ALTER TABLE people 
ADD COLUMN IF NOT EXISTS maternity_extension_days integer DEFAULT 0;

-- Create validation function for maternity leave eligibility
CREATE OR REPLACE FUNCTION validate_maternity_leave(
  p_person_id text,
  p_start_date date
) RETURNS jsonb AS $$
DECLARE
  v_contract_date date;
  v_contract_model text;
  v_extension_days integer;
  v_expected_delivery date;
  v_days_before_delivery integer;
BEGIN
  -- Get person data
  SELECT data_contrato, modelo_contrato, maternity_extension_days
  INTO v_contract_date, v_contract_model, v_extension_days
  FROM people
  WHERE id = p_person_id;
  
  -- Validate CLT contract exists
  IF v_contract_date IS NULL OR v_contract_model IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'message', 'Colaboradora precisa ter contrato CLT registrado'
    );
  END IF;
  
  -- Validate contract is CLT type
  IF v_contract_model NOT LIKE 'CLT%' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'message', 'Licença maternidade é válida apenas para contratos CLT'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'valid', true,
    'total_days', 120 + COALESCE(v_extension_days, 0),
    'clt_days', 120,
    'extension_days', COALESCE(v_extension_days, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;