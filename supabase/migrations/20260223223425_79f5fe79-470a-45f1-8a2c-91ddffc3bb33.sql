
-- Add a check constraint for message length (max 200 chars)
ALTER TABLE public.lost_chat_messages
ADD CONSTRAINT lost_chat_message_length CHECK (char_length(message) <= 200);

-- Add a check constraint for nickname length
ALTER TABLE public.lost_chat_messages
ADD CONSTRAINT lost_chat_nickname_length CHECK (char_length(nickname) <= 50);
