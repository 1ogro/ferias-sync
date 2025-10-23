-- Job executed daily to mark finalized requests as REALIZADO
SELECT cron.schedule(
  'update-requests-to-realizado',
  '1 0 * * *', -- Every day at 00:01 UTC
  $$
    UPDATE requests
    SET status = 'REALIZADO', updated_at = now()
    WHERE status = 'APROVADO_FINAL'
      AND fim < CURRENT_DATE
      AND fim IS NOT NULL;
  $$
);