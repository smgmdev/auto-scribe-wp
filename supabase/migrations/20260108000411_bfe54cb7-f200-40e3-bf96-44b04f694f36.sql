-- Add order_id column to credit_transactions table to link credit transactions to orders
ALTER TABLE public.credit_transactions 
ADD COLUMN order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_credit_transactions_order_id ON public.credit_transactions(order_id);