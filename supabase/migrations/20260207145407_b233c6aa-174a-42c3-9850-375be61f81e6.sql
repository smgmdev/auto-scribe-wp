-- Drop the existing check constraint
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

-- Add the updated check constraint with admin_deduct type
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_type_check 
CHECK (type IN ('purchase', 'usage', 'gifted', 'refund', 'admin_credit', 'order_payout', 'locked', 'unlocked', 'offer_accepted', 'admin_deduct'));