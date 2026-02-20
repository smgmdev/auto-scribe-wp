-- Add metadata column to credit_transactions to persist publication links
ALTER TABLE public.credit_transactions ADD COLUMN metadata jsonb DEFAULT NULL;