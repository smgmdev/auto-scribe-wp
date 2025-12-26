-- Add order_number column for custom alphanumeric order IDs
ALTER TABLE public.orders 
ADD COLUMN order_number TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX idx_orders_order_number ON public.orders(order_number);