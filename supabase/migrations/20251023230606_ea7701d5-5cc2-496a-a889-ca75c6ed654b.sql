-- Daily reminder for managers with pending requests for more than 3 days
SELECT cron.schedule(
  'daily-pending-reminder',
  '0 9 * * 1-5', -- Monday to Friday at 09:00 UTC
  $$
    SELECT net.http_post(
      url := 'https://uhphxyhffpbnmsrlggbe.supabase.co/functions/v1/send-scheduled-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'type', 'DAILY_PENDING',
        'days_threshold', 3
      )
    ) as request_id;
  $$
);

-- Weekly reminder for directors
SELECT cron.schedule(
  'weekly-director-reminder',
  '0 10 * * 1', -- Every Monday at 10:00 UTC
  $$
    SELECT net.http_post(
      url := 'https://uhphxyhffpbnmsrlggbe.supabase.co/functions/v1/send-scheduled-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'type', 'WEEKLY_DIRECTOR'
      )
    ) as request_id;
  $$
);