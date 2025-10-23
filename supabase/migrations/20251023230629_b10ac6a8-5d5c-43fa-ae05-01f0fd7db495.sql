-- Monthly vacation alerts for managers
SELECT cron.schedule(
  'monthly-vacation-alerts',
  '0 8 1 * *', -- Day 1 of each month at 08:00 UTC
  $$
    SELECT net.http_post(
      url := 'https://uhphxyhffpbnmsrlggbe.supabase.co/functions/v1/send-scheduled-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'type', 'MONTHLY_VACATION_ALERTS'
      )
    ) as request_id;
  $$
);