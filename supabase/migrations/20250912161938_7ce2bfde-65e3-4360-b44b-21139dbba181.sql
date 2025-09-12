-- Add modelo_contrato column to people table
ALTER TABLE public.people 
ADD COLUMN modelo_contrato TEXT DEFAULT 'CLT' CHECK (modelo_contrato IN ('PJ', 'CLT'));