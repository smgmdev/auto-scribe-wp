-- Drop the old constraint
ALTER TABLE credit_transactions DROP CONSTRAINT credit_transactions_type_check;

-- Add the updated constraint with 'order' type
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_type_check 
CHECK (type = ANY (ARRAY['purchase'::text, 'publish'::text, 'refund'::text, 'admin_grant'::text, 'order'::text, 'usage'::text, 'deduction'::text, 'bonus'::text]));