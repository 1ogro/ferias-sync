-- Insert remaining historical vacation requests
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'APROVADO_FINAL', '2025-07-14', '2025-07-28', 'Saldo de 16 dias'
FROM public.people p
WHERE p.nome = 'André Mizarela'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-07-14'
);

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'APROVADO_FINAL', '2025-09-29', '2025-10-03', 'Referente a 2024: 5 dias (2 a 6/12) + 2 dias (27 e 28/3) + 10 dias (16 a 25/7)'
FROM public.people p
WHERE p.nome = 'Airton Jordani'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-09-29'
);

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'REALIZADO', '2025-01-13', '2025-01-17', 'Saldo de 25 dias'
FROM public.people p
WHERE p.nome = 'Antenor Jr'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-01-13'
);

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'APROVADO_FINAL', '2025-10-13', '2025-10-17', 'Saldo de 20 dias'
FROM public.people p
WHERE p.nome = 'Antenor Jr'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-10-13'
);

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

-- Demais registros já inseridos, continuar com outros funcionários
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'APROVADO_FINAL', '2025-11-21', '2025-12-07', 'Saldo 15 dias'
FROM public.people p
WHERE p.nome = 'Douglas D''Andrade'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-11-21'
);

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'APROVADO_FINAL', '2025-09-29', '2025-10-27', 'Saldo 20 dias'
FROM public.people p
WHERE p.nome = 'Ariel Cardeal'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2025-09-29'
);

INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, justificativa)
SELECT p.id, 'FERIAS', 'APROVADO_FINAL', '2026-01-05', '2026-01-24', ''
FROM public.people p
WHERE p.nome = 'Juliana Maulim'
AND NOT EXISTS (
    SELECT 1 FROM public.requests r 
    WHERE r.requester_id = p.id 
    AND r.inicio = '2026-01-05'
);