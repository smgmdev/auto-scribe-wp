-- Create table for storing minimized chats per user
CREATE TABLE public.minimized_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  request_id UUID NOT NULL,
  title TEXT NOT NULL,
  media_site_name TEXT,
  media_site_favicon TEXT,
  chat_type TEXT NOT NULL DEFAULT 'client',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.minimized_chats ENABLE ROW LEVEL SECURITY;

-- Users can only see their own minimized chats
CREATE POLICY "Users can view their own minimized chats"
ON public.minimized_chats
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own minimized chats
CREATE POLICY "Users can insert their own minimized chats"
ON public.minimized_chats
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own minimized chats
CREATE POLICY "Users can delete their own minimized chats"
ON public.minimized_chats
FOR DELETE
USING (auth.uid() = user_id);

-- Create unique constraint to prevent duplicate minimized chats
CREATE UNIQUE INDEX idx_minimized_chats_user_request ON public.minimized_chats(user_id, request_id);