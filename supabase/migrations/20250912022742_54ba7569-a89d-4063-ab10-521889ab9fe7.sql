-- Insert contract dates for existing people
UPDATE public.people SET data_contrato = '2020-01-15' WHERE nome = 'André Mizarela' AND data_contrato IS NULL;
UPDATE public.people SET data_contrato = '2019-03-01' WHERE nome = 'Airton Jordani' AND data_contrato IS NULL;  
UPDATE public.people SET data_contrato = '2021-06-01' WHERE nome = 'Antenor Jr' AND data_contrato IS NULL;
UPDATE public.people SET data_contrato = '2018-01-01' WHERE nome = 'Raul Queiroz' AND data_contrato IS NULL;
UPDATE public.people SET data_contrato = '2020-02-27' WHERE nome = 'Vanessa Adão' AND data_contrato IS NULL;
UPDATE public.people SET data_contrato = '2022-01-10' WHERE nome = 'Larissa Pardal' AND data_contrato IS NULL;
UPDATE public.people SET data_contrato = '2021-04-01' WHERE nome = 'Helio Pereira Junior' AND data_contrato IS NULL;
UPDATE public.people SET data_contrato = '2020-07-01' WHERE nome = 'Haroldo Portella' AND data_contrato IS NULL;
UPDATE public.people SET data_contrato = '2022-05-01' WHERE nome = 'Bruno Salomon' AND data_contrato IS NULL;
UPDATE public.people SET data_contrato = '2021-08-01' WHERE nome = 'Pedro Belsito' AND data_contrato IS NULL;
UPDATE public.people SET data_contrato = '2019-11-01' WHERE nome = 'Douglas D''Andrade' AND data_contrato IS NULL;
UPDATE public.people SET data_contrato = '2020-09-01' WHERE nome = 'Ariel Cardeal' AND data_contrato IS NULL;
UPDATE public.people SET data_contrato = '2023-01-01' WHERE nome = 'Juliana Maulim' AND data_contrato IS NULL;

-- Insert historical vacation requests based on CSV data (only if they don't already exist)

-- André Mizarela
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa) 
SELECT p.id, 'FERIAS', 'APROVADO_FINAL', '2025-07-14', '2025-07-28', 'Saldo de 16 dias'
FROM public.people p
WHERE p.nome = 'André Mizarela'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-07-14'
);

-- Airton Jordani  
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'APROVADO_FINAL', '2025-09-29', '2025-10-03', 'Referente a 2024: 5 dias (2 a 6/12) + 2 dias (27 e 28/3) + 10 dias (16 a 25/7)'
FROM public.people p
WHERE p.nome = 'Airton Jordani'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-09-29'
);

-- Antenor Jr - first request (realized)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'REALIZADO', '2025-01-13', '2025-01-17', 'Saldo de 25 dias'
FROM public.people p
WHERE p.nome = 'Antenor Jr'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-01-13'
);

-- Antenor Jr - second request (approved)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'APROVADO_FINAL', '2025-10-13', '2025-10-17', 'Saldo de 20 dias'
FROM public.people p
WHERE p.nome = 'Antenor Jr'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-10-13'
);

-- Vanessa Adão - multiple requests
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'REALIZADO', '2025-02-20', '2025-02-21', 'saldo de 32 dias'
FROM public.people p
WHERE p.nome = 'Vanessa Adão'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-02-20'
);

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'DAYOFF', 'REALIZADO', '2025-02-27', '2025-02-27', 'dia do meu aniversário (ainda há 2 dias de crédito de 2023 + 30 dias de 2024)'
FROM public.people p
WHERE p.nome = 'Vanessa Adão'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-02-27'
    AND r.tipo = 'DAYOFF'
);

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'REALIZADO', '2025-03-17', '2025-03-28', 'Saldo de 50 dias'
FROM public.people p
WHERE p.nome = 'Vanessa Adão'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-03-17'
);

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'REALIZADO', '2025-05-15', '2025-05-16', 'Saldo de 18 dias'
FROM public.people p
WHERE p.nome = 'Vanessa Adão'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-05-15'
);

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'REALIZADO', '2025-07-14', '2025-07-18', 'Saldo 43 dias'
FROM public.people p
WHERE p.nome = 'Vanessa Adão'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-07-14'
    AND r.fim = '2025-07-18'
);

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'REALIZADO', '2025-08-04', '2025-08-15', 'Saldo de 31 dias'
FROM public.people p
WHERE p.nome = 'Vanessa Adão'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-08-04'
);

-- Continue with other employees...
-- Larissa Pardal
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'REALIZADO', '2025-07-21', '2025-07-31', 'Saldo de 9 dias'
FROM public.people p
WHERE p.nome = 'Larissa Pardal'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-07-21'
);

-- Helio Pereira Junior - multiple requests
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'REALIZADO', '2025-05-12', '2025-05-16', 'Saldo de 17 dias'
FROM public.people p
WHERE p.nome = 'Helio Pereira Junior'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-05-12'
);

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'REALIZADO', '2025-07-21', '2025-07-25', 'Saldo de 12 dias'
FROM public.people p
WHERE p.nome = 'Helio Pereira Junior'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-07-21'
);

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'REALIZADO', '2025-09-08', '2025-09-19', 'Saldo de 2 dias'
FROM public.people p
WHERE p.nome = 'Helio Pereira Junior'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-09-08'
);

-- Haroldo Portella - first request (realized)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'REALIZADO', '2025-07-18', '2025-08-01', 'Saldo de 15 dias'
FROM public.people p
WHERE p.nome = 'Haroldo Portella'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-07-18'
);

-- Haroldo Portella - second request (approved)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'APROVADO_FINAL', '2025-10-27', '2025-10-31', 'Saldo 10 dias'
FROM public.people p
WHERE p.nome = 'Haroldo Portella'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-10-27'
);

-- Bruno Salomon
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'REALIZADO', '2025-06-16', '2025-06-27', '0'
FROM public.people p
WHERE p.nome = 'Bruno Salomon'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-06-16'
);

-- Pedro Belsito
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'EM_ANDAMENTO', '2025-09-01', '2025-09-20', '0'
FROM public.people p
WHERE p.nome = 'Pedro Belsito'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-09-01'
);

-- Douglas D'Andrade
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'APROVADO_FINAL', '2025-11-21', '2025-12-07', 'Saldo 15 dias'
FROM public.people p
WHERE p.nome = 'Douglas D''Andrade'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-11-21'
);

-- Ariel Cardeal
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'APROVADO_FINAL', '2025-09-29', '2025-10-27', 'Saldo 20 dias'
FROM public.people p
WHERE p.nome = 'Ariel Cardeal'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-09-29'
);

-- Juliana Maulim
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'APROVADO_FINAL', '2026-01-05', '2026-01-24', ''
FROM public.people p
WHERE p.nome = 'Juliana Maulim'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2026-01-05'
);