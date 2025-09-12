-- Inserir registros históricos de férias com IDs corretos

-- Vanessa Adão - Day Off realizado em 27/fev/2025
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, created_at, updated_at, justificativa)
VALUES ('pessoa_019', 'DAYOFF', 'REALIZADO', '2025-02-27', '2025-02-27', '2025-02-27 10:00:00+00', '2025-02-27 10:00:00+00', 'Day Off de aniversário');

-- Vanessa Adão - Férias realizadas 17/mar-28/mar/2025 (12 dias)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, created_at, updated_at, justificativa)
VALUES ('pessoa_019', 'FERIAS', 'REALIZADO', '2025-03-17', '2025-03-28', '2025-03-15 10:00:00+00', '2025-03-28 17:00:00+00', 'Férias programadas');

-- Vanessa Adão - Férias realizadas 15/mai-16/mai/2025 (2 dias)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, created_at, updated_at, justificativa)
VALUES ('pessoa_019', 'FERIAS', 'REALIZADO', '2025-05-15', '2025-05-16', '2025-05-10 10:00:00+00', '2025-05-16 17:00:00+00', 'Férias de 2 dias');

-- Vanessa Adão - Férias realizadas 14/jul-18/jul/2025 (5 dias)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, created_at, updated_at, justificativa)
VALUES ('pessoa_019', 'FERIAS', 'REALIZADO', '2025-07-14', '2025-07-18', '2025-07-10 10:00:00+00', '2025-07-18 17:00:00+00', 'Férias de 5 dias');

-- Vanessa Adão - Férias realizadas 04/ago-15/ago/2025 (12 dias)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, created_at, updated_at, justificativa)
VALUES ('pessoa_019', 'FERIAS', 'REALIZADO', '2025-08-04', '2025-08-15', '2025-08-01 10:00:00+00', '2025-08-15 17:00:00+00', 'Férias de 12 dias');

-- Larissa Pardal - Férias realizadas 21/jul-31/jul/2025 (11 dias)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, created_at, updated_at, justificativa)
VALUES ('pessoa_011', 'FERIAS', 'REALIZADO', '2025-07-21', '2025-07-31', '2025-07-15 10:00:00+00', '2025-07-31 17:00:00+00', 'Férias de verão');

-- Helio Pereira Junior - Férias realizadas 12/mai-16/mai/2025 (5 dias)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, created_at, updated_at, justificativa)
VALUES ('pessoa_009', 'FERIAS', 'REALIZADO', '2025-05-12', '2025-05-16', '2025-05-08 10:00:00+00', '2025-05-16 17:00:00+00', 'Férias de maio');

-- Helio Pereira Junior - Férias realizadas 21/jul-25/jul/2025 (5 dias)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, created_at, updated_at, justificativa)
VALUES ('pessoa_009', 'FERIAS', 'REALIZADO', '2025-07-21', '2025-07-25', '2025-07-18 10:00:00+00', '2025-07-25 17:00:00+00', 'Férias de julho');

-- Helio Pereira Junior - Férias realizadas 08/set-19/set/2025 (10 dias)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, created_at, updated_at, justificativa)
VALUES ('pessoa_009', 'FERIAS', 'REALIZADO', '2025-09-08', '2025-09-19', '2025-09-05 10:00:00+00', '2025-09-19 17:00:00+00', 'Férias de setembro');

-- Haroldo Portella - Férias aprovadas 27/out-31/out/2025 (5 dias)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, created_at, updated_at, justificativa)
VALUES ('pessoa_008', 'FERIAS', 'APROVADO_FINAL', '2025-10-27', '2025-10-31', '2025-10-20 10:00:00+00', '2025-10-25 15:00:00+00', 'Férias de outubro');

-- Bruno Salomon - Férias realizadas 16/jun-27/jun/2025 (12 dias)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, created_at, updated_at, justificativa)
VALUES ('pessoa_004', 'FERIAS', 'REALIZADO', '2025-06-16', '2025-06-27', '2025-06-10 10:00:00+00', '2025-06-27 17:00:00+00', 'Férias de junho');

-- Pedro Belsito - Férias em andamento 01/set-20/set/2025 (20 dias)
INSERT INTO public.requests (requester_id, tipo, status, inicio, fim, created_at, updated_at, justificativa)
VALUES ('pessoa_013', 'FERIAS', 'EM_ANDAMENTO', '2025-09-01', '2025-09-20', '2025-08-25 10:00:00+00', '2025-09-01 08:00:00+00', 'Férias de setembro');