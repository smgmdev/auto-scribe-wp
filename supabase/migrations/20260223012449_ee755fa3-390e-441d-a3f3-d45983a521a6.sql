
-- Create table for 404 page anonymous chat
CREATE TABLE public.lost_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nickname TEXT NOT NULL DEFAULT 'Anonymous',
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lost_chat_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can view messages
CREATE POLICY "Anyone can view lost chat messages"
ON public.lost_chat_messages FOR SELECT
USING (true);

-- Anyone can insert messages (anonymous)
CREATE POLICY "Anyone can send lost chat messages"
ON public.lost_chat_messages FOR INSERT
WITH CHECK (true);

-- Auto-delete old messages (keep last 50)
CREATE OR REPLACE FUNCTION public.cleanup_lost_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.lost_chat_messages
  WHERE id NOT IN (
    SELECT id FROM public.lost_chat_messages
    ORDER BY created_at DESC
    LIMIT 50
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER cleanup_lost_chat_trigger
AFTER INSERT ON public.lost_chat_messages
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_lost_chat();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lost_chat_messages;
