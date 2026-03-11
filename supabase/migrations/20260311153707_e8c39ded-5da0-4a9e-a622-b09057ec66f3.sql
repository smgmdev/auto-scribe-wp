ALTER TABLE public.marketing_send_control
  ADD COLUMN IF NOT EXISTS sending_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sending_category text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sending_started_at timestamp with time zone DEFAULT NULL;