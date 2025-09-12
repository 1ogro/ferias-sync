-- Add fields for manual balance management
ALTER TABLE vacation_balances 
ADD COLUMN IF NOT EXISTS manual_justification TEXT,
ADD COLUMN IF NOT EXISTS updated_by TEXT;