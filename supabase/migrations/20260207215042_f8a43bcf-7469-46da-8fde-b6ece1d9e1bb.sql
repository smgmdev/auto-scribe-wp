-- Drop the existing check constraint and add a new one with withdrawal types
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

-- Add the updated check constraint with all types including withdrawal types
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_type_check 
CHECK (type IN ('purchase', 'gifted', 'spent', 'locked', 'unlocked', 'order_accepted', 'offer_accepted', 'order_completed', 'order_delivered', 'refund', 'adjustment', 'admin_deduct', 'order_payout', 'withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed'));