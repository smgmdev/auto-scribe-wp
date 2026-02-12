
-- Create table for storing flagged chat messages with contact-sharing detection
CREATE TABLE public.flagged_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  request_id uuid NOT NULL,
  sender_id text NOT NULL,
  sender_type text NOT NULL,
  message_text text NOT NULL,
  detected_type text NOT NULL, -- 'email', 'phone', 'discord', 'telegram', 'whatsapp', 'skype', 'instagram', 'twitter', 'facebook', 'linkedin', 'snapchat', 'social_media', 'other'
  detected_value text NOT NULL,
  flagged_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.flagged_chat_messages ENABLE ROW LEVEL SECURITY;

-- Only admins can access flagged messages
CREATE POLICY "Admins can manage flagged messages"
  ON public.flagged_chat_messages
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for fast lookups
CREATE INDEX idx_flagged_chat_messages_request ON public.flagged_chat_messages(request_id);
CREATE INDEX idx_flagged_chat_messages_reviewed ON public.flagged_chat_messages(reviewed);
CREATE INDEX idx_flagged_chat_messages_message ON public.flagged_chat_messages(message_id);

-- Enable realtime for flagged messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.flagged_chat_messages;
