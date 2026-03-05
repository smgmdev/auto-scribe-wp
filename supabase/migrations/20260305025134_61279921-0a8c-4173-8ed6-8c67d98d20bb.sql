
-- Add dismissed_title column to store the title at dismissal time
-- so we don't depend on the alert still existing in missile_alerts
ALTER TABLE public.dismissed_missile_alerts
ADD COLUMN IF NOT EXISTS dismissed_title text;

-- Add unique constraint to prevent duplicate dismissals
ALTER TABLE public.dismissed_missile_alerts
ADD CONSTRAINT dismissed_missile_alerts_user_alert_unique UNIQUE (user_id, alert_id);
