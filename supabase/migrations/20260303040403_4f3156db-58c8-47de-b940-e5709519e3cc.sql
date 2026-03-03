
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_chat_id text UNIQUE;
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_chat_id ON public.profiles (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
