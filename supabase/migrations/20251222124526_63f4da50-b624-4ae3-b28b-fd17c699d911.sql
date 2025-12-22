-- Enable REPLICA IDENTITY FULL for service_messages to receive DELETE events in realtime
ALTER TABLE public.service_messages REPLICA IDENTITY FULL;