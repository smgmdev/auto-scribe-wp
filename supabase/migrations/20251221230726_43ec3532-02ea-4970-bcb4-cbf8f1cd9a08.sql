-- Enable realtime for service_requests table
ALTER TABLE public.service_requests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;

-- Enable realtime for service_messages table
ALTER TABLE public.service_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_messages;