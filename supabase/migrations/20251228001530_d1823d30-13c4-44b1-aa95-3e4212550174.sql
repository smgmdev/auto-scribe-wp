-- Add unread_count column to minimized_chats to persist unread message counts
ALTER TABLE public.minimized_chats 
ADD COLUMN unread_count integer NOT NULL DEFAULT 0;