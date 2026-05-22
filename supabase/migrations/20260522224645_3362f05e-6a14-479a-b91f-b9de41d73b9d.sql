SELECT cron.unschedule('contract-anniversary-daily');

SELECT cron.schedule(
  'contract-anniversary-monthly-checkpoints',
  '0 12 1,10,20,30 * *',
  $$
  SELECT net.http_post(
    url := 'https://uhphxyhffpbnmsrlggbe.supabase.co/functions/v1/send-contract-anniversary-notifications',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVocGh4eWhmZnBibm1zcmxnZ2JlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2MTgwMzEsImV4cCI6MjA3MzE5NDAzMX0.BLCl9B6Dh5WnlFdN42lq1kDMcXpPiKYe5wXrNGAC-Xg"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);