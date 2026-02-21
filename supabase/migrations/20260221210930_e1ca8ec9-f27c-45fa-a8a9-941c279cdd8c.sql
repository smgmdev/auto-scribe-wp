
-- Convert all _cents columns from cents to credits (divide by 100)
-- 1 credit = $1 = 100 cents, so dividing existing cents by 100 gives credits

-- Orders: amount_cents, platform_fee_cents, agency_payout_cents
UPDATE public.orders SET
  amount_cents = amount_cents / 100,
  platform_fee_cents = platform_fee_cents / 100,
  agency_payout_cents = agency_payout_cents / 100
WHERE amount_cents > 0;

-- Agency withdrawals
UPDATE public.agency_withdrawals SET amount_cents = amount_cents / 100
WHERE amount_cents > 0;

-- Credit packs
UPDATE public.credit_packs SET price_cents = price_cents / 100
WHERE price_cents > 0;

-- Payout transactions
UPDATE public.payout_transactions SET amount_cents = amount_cents / 100
WHERE amount_cents > 0;

-- Withdrawal-type credit transactions (these were stored in cents unlike other tx types)
UPDATE public.credit_transactions SET amount = amount / 100
WHERE type IN ('withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed');
