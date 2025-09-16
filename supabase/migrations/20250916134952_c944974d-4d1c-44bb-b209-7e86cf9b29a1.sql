-- Drop the existing constraint that only allows PJ and CLT
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_modelo_contrato_check;

-- Create new constraint that includes all allowed contract types
ALTER TABLE people ADD CONSTRAINT people_modelo_contrato_check 
CHECK (modelo_contrato IS NULL OR modelo_contrato IN ('PJ', 'CLT', 'CLT_ABONO_LIVRE', 'CLT_ABONO_FIXO'));