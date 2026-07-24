-- 1) Corrigir job crítico: era 21:01 BRT (00:01 UTC) usando CURRENT_DATE (UTC),
--    o que marcava férias como REALIZADO enquanto o colaborador ainda estava
--    no último dia em SP. Agora roda às 00:15 BRT (03:15 UTC) e compara
--    contra a data local de São Paulo.
SELECT cron.unschedule('update-requests-to-realizado');

SELECT cron.schedule(
  'update-requests-to-realizado',
  '15 3 * * *', -- 00:15 BRT
  $$
    UPDATE public.requests
    SET status = 'REALIZADO', updated_at = now()
    WHERE status = 'APROVADO_FINAL'
      AND fim IS NOT NULL
      AND fim < (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  $$
);

-- 2) Reagendar jobs que rodavam de madrugada BRT para 09h BRT (12h UTC).

-- daily-pending-reminder: era 06 BRT (09 UTC) → 09 BRT (12 UTC)
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'daily-pending-reminder'),
  schedule => '0 12 * * 1-5'
);

-- weekly-director-reminder: era 07 BRT seg (10 UTC) → 09 BRT seg (12 UTC)
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'weekly-director-reminder'),
  schedule => '0 12 * * 1'
);

-- weekly-open-requests-digest: era 06 BRT seg (09 UTC) → 09 BRT seg (12 UTC)
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'weekly-open-requests-digest'),
  schedule => '0 12 * * 1'
);

-- engagement-monthly-report: era 06 BRT dia 1 (09 UTC) → 09 BRT dia 1 (12 UTC)
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'engagement-monthly-report'),
  schedule => '0 12 1 * *'
);

-- monthly-vacation-alerts: era 05 BRT dia 1 (08 UTC) → 09 BRT dia 1 (12 UTC)
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'monthly-vacation-alerts'),
  schedule => '0 12 1 * *'
);

-- 3) Registrar auditoria da correção.
INSERT INTO public.audit_logs (entidade, entidade_id, acao, payload)
VALUES (
  'system',
  'timezone-audit-2026-07-24',
  'TIMEZONE_AUDIT_APPLIED',
  jsonb_build_object(
    'summary', 'Auditoria completa de fuso: correções em cron jobs e edge functions para ancorar todas as datas/notificações em America/Sao_Paulo',
    'critical_fix', 'update-requests-to-realizado: era 21:01 BRT UTC-CURRENT_DATE, marcava férias antes do último dia terminar. Agora 00:15 BRT SP-local.',
    'rescheduled_jobs', jsonb_build_array(
      'daily-pending-reminder → 09 BRT',
      'weekly-director-reminder → 09 BRT seg',
      'weekly-open-requests-digest → 09 BRT seg',
      'engagement-monthly-report → 09 BRT dia 1',
      'monthly-vacation-alerts → 09 BRT dia 1'
    ),
    'edge_functions_hardened', jsonb_build_array(
      'slack-interactions (checkin/checkout classifier — Intl parts)',
      'list-upcoming-absences (hoje em SP)',
      'send-weekly-open-requests-digest (entidade_id em data SP)',
      'engagement-monthly-report (mês anterior em SP)'
    ),
    'shared_module', 'supabase/functions/_shared/date.ts'
  )
);