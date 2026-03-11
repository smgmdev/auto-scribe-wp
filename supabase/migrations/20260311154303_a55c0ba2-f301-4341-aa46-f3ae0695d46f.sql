ALTER TABLE public.marketing_send_control
  ADD COLUMN IF NOT EXISTS email_subject text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_html text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_prompt text DEFAULT NULL;