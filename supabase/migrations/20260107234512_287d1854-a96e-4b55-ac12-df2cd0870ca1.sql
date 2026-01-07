-- Drop the existing check constraint and add a new one with more types
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

-- Add new check constraint with earnings type
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_type_check 
CHECK (type IN ('order', 'refund', 'order_payout', 'withdrawal', 'adjustment'));

-- Update the existing transaction we just inserted to correct type
UPDATE credit_transactions 
SET type = 'order_payout', description = 'Earnings from completed order: Custom media name 7 (Platform fee: 99 credits)'
WHERE user_id = 'f188d6d5-d38f-4e87-9922-5dcf1c44239a' 
AND description LIKE '%Earnings from completed order%';