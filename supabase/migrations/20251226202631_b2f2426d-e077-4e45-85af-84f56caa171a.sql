-- Add read column to orders table for tracking unread orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false;

-- Create index for faster queries on unread orders
CREATE INDEX IF NOT EXISTS idx_orders_read ON public.orders(read);

-- Enable realtime for orders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;