-- Drop the existing check constraint and recreate with all types including 'gifted'
ALTER TABLE public.credit_transactions 
DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions 
ADD CONSTRAINT credit_transactions_type_check 
CHECK (type IN ('purchase', 'refund', 'usage', 'gifted', 'refund_request', 'locked', 'released', 'order', 'order_payout'));