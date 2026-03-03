
CREATE TABLE public.telegram_verification_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id text NOT NULL,
  email text NOT NULL,
  verify_code text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(telegram_chat_id)
);

-- No RLS needed - only accessed via service role from edge function
ALTER TABLE public.telegram_verification_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access" ON public.telegram_verification_sessions
  FOR ALL USING (false) WITH CHECK (false);
