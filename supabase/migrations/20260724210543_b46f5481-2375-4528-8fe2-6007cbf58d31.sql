-- Reancora next_run_at dos pulses semanais no horário histórico correto,
-- desfazendo o drift acumulado pela lógica anterior (que usava now() como base).
UPDATE public.pulse_surveys
SET next_run_at = '2026-07-27 13:15:00+00'
WHERE id = '6a8e78a7-5fbf-4e2e-bff4-918109b05f5f';

UPDATE public.pulse_surveys
SET next_run_at = '2026-07-31 20:45:00+00'
WHERE id = 'd7937f3c-4cee-4c7b-bf7a-0b31ae2c1b08';

UPDATE public.pulse_surveys
SET next_run_at = '2026-07-31 15:45:00+00'
WHERE id = 'cc71fbb8-c79d-4373-bf19-c508cfed8905';