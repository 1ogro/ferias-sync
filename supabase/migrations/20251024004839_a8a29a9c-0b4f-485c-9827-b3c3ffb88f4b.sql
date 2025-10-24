-- Add email integration fields to integration_settings table
ALTER TABLE integration_settings
ADD COLUMN IF NOT EXISTS email_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS email_from_address text,
ADD COLUMN IF NOT EXISTS email_from_name text,
ADD COLUMN IF NOT EXISTS email_status text DEFAULT 'not_configured',
ADD COLUMN IF NOT EXISTS email_error_message text,
ADD COLUMN IF NOT EXISTS email_test_date timestamp with time zone;