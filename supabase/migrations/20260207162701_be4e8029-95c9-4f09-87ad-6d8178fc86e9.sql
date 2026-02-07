-- Drop the existing check constraint and add a new one that includes 'order_completed'
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_type_check 
CHECK (type IN ('purchase', 'spent', 'locked', 'unlocked', 'order_accepted', 'offer_accepted', 'order_delivered', 'refund', 'adjustment', 'admin_deduct', 'gifted', 'admin_credit', 'order_payout', 'order_completed'));