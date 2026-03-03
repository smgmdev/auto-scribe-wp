
CREATE TABLE public.telegram_bot_sessions (
  chat_id text PRIMARY KEY,
  session_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Allow service role only (no RLS needed since edge functions use service role)
ALTER TABLE public.telegram_bot_sessions ENABLE ROW LEVEL SECURITY;

-- Auto-cleanup sessions older than 2 hours via index for easy querying
CREATE INDEX idx_telegram_bot_sessions_updated ON public.telegram_bot_sessions (updated_at);
