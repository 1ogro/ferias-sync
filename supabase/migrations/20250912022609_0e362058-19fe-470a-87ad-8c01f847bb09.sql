-- Add data_contrato field to people table
ALTER TABLE public.people ADD COLUMN data_contrato DATE;

-- Update Status enum to include EM_ANDAMENTO
ALTER TYPE public.status ADD VALUE IF NOT EXISTS 'EM_ANDAMENTO';

-- Create vacation_balances table to track vacation balances per year
CREATE TABLE public.vacation_balances (
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

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_vacation_balances_updated_at
BEFORE UPDATE ON public.vacation_balances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert historical data from CSV
-- First, let's add some contract dates for existing people
UPDATE public.people SET data_contrato = '2020-01-15' WHERE nome = 'André Mizarela';
UPDATE public.people SET data_contrato = '2019-03-01' WHERE nome = 'Airton Jordani';  
UPDATE public.people SET data_contrato = '2021-06-01' WHERE nome = 'Antenor Jr';
UPDATE public.people SET data_contrato = '2018-01-01' WHERE nome = 'Raul Queiroz';
UPDATE public.people SET data_contrato = '2020-02-27' WHERE nome = 'Vanessa Adão';
UPDATE public.people SET data_contrato = '2022-01-10' WHERE nome = 'Larissa Pardal';
UPDATE public.people SET data_contrato = '2021-04-01' WHERE nome = 'Helio Pereira Junior';
UPDATE public.people SET data_contrato = '2020-07-01' WHERE nome = 'Haroldo Portella';
UPDATE public.people SET data_contrato = '2022-05-01' WHERE nome = 'Bruno Salomon';
UPDATE public.people SET data_contrato = '2021-08-01' WHERE nome = 'Pedro Belsito';
UPDATE public.people SET data_contrato = '2019-11-01' WHERE nome = 'Douglas D''Andrade';
UPDATE public.people SET data_contrato = '2020-09-01' WHERE nome = 'Ariel Cardeal';
UPDATE public.people SET data_contrato = '2023-01-01' WHERE nome = 'Juliana Maulim';

-- Insert historical requests based on CSV data
-- André Mizarela
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa) 
SELECT id, 'FERIAS', 'APROVADO_FINAL', '2025-07-14', '2025-07-28', 'Saldo de 16 dias'
FROM public.people WHERE nome = 'André Mizarela';

-- Airton Jordani  
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'APROVADO_FINAL', '2025-09-29', '2025-10-03', 'Referente a 2024: 5 dias (2 a 6/12) + 2 dias (27 e 28/3) + 10 dias (16 a 25/7)'
FROM public.people WHERE nome = 'Airton Jordani';

-- Antenor Jr - first request (realized)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'REALIZADO', '2025-01-13', '2025-01-17', 'Saldo de 25 dias'
FROM public.people WHERE nome = 'Antenor Jr';

-- Antenor Jr - second request (approved)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'APROVADO_FINAL', '2025-10-13', '2025-10-17', 'Saldo de 20 dias'
FROM public.people WHERE nome = 'Antenor Jr';

-- Vanessa Adão - multiple requests
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'REALIZADO', '2025-02-20', '2025-02-21', 'saldo de 32 dias'
FROM public.people WHERE nome = 'Vanessa Adão';

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'DAYOFF', 'REALIZADO', '2025-02-27', '2025-02-27', 'dia do meu aniversário (ainda há 2 dias de crédito de 2023 + 30 dias de 2024)'
FROM public.people WHERE nome = 'Vanessa Adão';

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'REALIZADO', '2025-03-17', '2025-03-28', 'Saldo de 50 dias'
FROM public.people WHERE nome = 'Vanessa Adão';

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'REALIZADO', '2025-05-15', '2025-05-16', 'Saldo de 18 dias'
FROM public.people WHERE nome = 'Vanessa Adão';

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'REALIZADO', '2025-07-14', '2025-07-18', 'Saldo 43 dias'
FROM public.people WHERE nome = 'Vanessa Adão';

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'REALIZADO', '2025-08-04', '2025-08-15', 'Saldo de 31 dias'
FROM public.people WHERE nome = 'Vanessa Adão';

-- Larissa Pardal
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'REALIZADO', '2025-07-21', '2025-07-31', 'Saldo de 9 dias'
FROM public.people WHERE nome = 'Larissa Pardal';

-- Helio Pereira Junior - multiple requests
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'REALIZADO', '2025-05-12', '2025-05-16', 'Saldo de 17 dias'
FROM public.people WHERE nome = 'Helio Pereira Junior';

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'REALIZADO', '2025-07-21', '2025-07-25', 'Saldo de 12 dias'
FROM public.people WHERE nome = 'Helio Pereira Junior';

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'REALIZADO', '2025-09-08', '2025-09-19', 'Saldo de 2 dias'
FROM public.people WHERE nome = 'Helio Pereira Junior';

-- Haroldo Portella - first request (realized)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'REALIZADO', '2025-07-18', '2025-08-01', 'Saldo de 15 dias'
FROM public.people WHERE nome = 'Haroldo Portella';

-- Haroldo Portella - second request (approved)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'APROVADO_FINAL', '2025-10-27', '2025-10-31', 'Saldo 10 dias'
FROM public.people WHERE nome = 'Haroldo Portella';

-- Bruno Salomon
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'REALIZADO', '2025-06-16', '2025-06-27', '0'
FROM public.people WHERE nome = 'Bruno Salomon';

-- Pedro Belsito
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'EM_ANDAMENTO', '2025-09-01', '2025-09-20', '0'
FROM public.people WHERE nome = 'Pedro Belsito';

-- Douglas D'Andrade
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'APROVADO_FINAL', '2025-11-21', '2025-12-07', 'Saldo 15 dias'
FROM public.people WHERE nome = 'Douglas D''Andrade';

-- Ariel Cardeal
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'APROVADO_FINAL', '2025-09-29', '2025-10-27', 'Saldo 20 dias'
FROM public.people WHERE nome = 'Ariel Cardeal';

-- Juliana Maulim
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT id, 'FERIAS', 'APROVADO_FINAL', '2026-01-05', '2026-01-24', ''
FROM public.people WHERE nome = 'Juliana Maulim';