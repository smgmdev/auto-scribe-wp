-- Enable realtime for credit_transactions table
ALTER TABLE public.credit_transactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_transactions;