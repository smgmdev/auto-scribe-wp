-- Drop the old constraint
ALTER TABLE public.credit_transactions DROP CONSTRAINT credit_transactions_type_check;

-- Add new constraint with all transaction types
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_type_check 
CHECK (type = ANY (ARRAY[
  'purchase'::text, 
  'refund'::text, 
  'usage'::text, 
  'gifted'::text, 
  'refund_request'::text, 
  'locked'::text, 
  'released'::text, 
  'unlocked'::text,
  'order'::text, 
  'order_payout'::text,
  'order_accepted'::text,
  'offer_accepted'::text,
  'order_delivered'::text,
  'spent'::text,
  'admin_credit'::text
]));