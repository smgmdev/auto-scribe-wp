-- Enable REPLICA IDENTITY FULL for orders table to ensure complete row data in realtime events
ALTER TABLE public.orders REPLICA IDENTITY FULL;