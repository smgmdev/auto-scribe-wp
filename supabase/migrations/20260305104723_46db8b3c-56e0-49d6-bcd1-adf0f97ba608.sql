
-- Update the sync trigger to also subtract withdrawal amounts from the balance
-- This makes user_credits.credits = totalBalance - withdrawalLocked - withdrawalCompleted
-- Which matches the "available credits" shown in credit management (minus dynamic order/request locks)

CREATE OR REPLACE FUNCTION public.sync_user_credits_from_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _incoming integer;
  _outgoing integer;
  _withdrawal_locked integer;
  _withdrawal_unlocked integer;
  _withdrawal_completed integer;
  _net_withdrawals integer;
  _new_balance integer;
BEGIN
  -- Determine which user_id to recalculate
  IF TG_OP = 'DELETE' THEN
    _user_id := OLD.user_id;
  ELSE
    _user_id := NEW.user_id;
  END IF;

  -- Calculate total balance using the same formula as calculateTotalBalance:
  -- incoming = positive amounts, excluding 'unlocked' and withdrawal types
  -- outgoing = |negative amounts|, excluding lock/offer/order types and withdrawal types
  SELECT COALESCE(SUM(amount), 0) INTO _incoming
  FROM public.credit_transactions
  WHERE user_id = _user_id
    AND amount > 0
    AND type NOT IN ('unlocked', 'withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed');

  SELECT COALESCE(SUM(ABS(amount)), 0) INTO _outgoing
  FROM public.credit_transactions
  WHERE user_id = _user_id
    AND amount < 0
    AND type NOT IN ('locked', 'locked_superseded', 'offer_accepted', 'offer_superseded', 'order', 'order_accepted', 'withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed');

  -- Calculate net withdrawal impact
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO _withdrawal_locked
  FROM public.credit_transactions
  WHERE user_id = _user_id AND type = 'withdrawal_locked';

  SELECT COALESCE(SUM(ABS(amount)), 0) INTO _withdrawal_unlocked
  FROM public.credit_transactions
  WHERE user_id = _user_id AND type = 'withdrawal_unlocked';

  SELECT COALESCE(SUM(ABS(amount)), 0) INTO _withdrawal_completed
  FROM public.credit_transactions
  WHERE user_id = _user_id AND type = 'withdrawal_completed';

  -- Net withdrawals = locked - unlocked (pending) + completed (done)
  -- Both reduce available balance
  _net_withdrawals := GREATEST(0, _withdrawal_locked - _withdrawal_unlocked - _withdrawal_completed) + _withdrawal_completed;

  _new_balance := (_incoming - _outgoing) - _net_withdrawals;

  -- Upsert user_credits
  INSERT INTO public.user_credits (user_id, credits, updated_at)
  VALUES (_user_id, _new_balance, now())
  ON CONFLICT (user_id)
  DO UPDATE SET credits = _new_balance, updated_at = now();

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- Recalculate ALL user balances with the new formula
WITH recalc AS (
  SELECT
    ct.user_id,
    COALESCE(SUM(CASE WHEN ct.amount > 0 AND ct.type NOT IN ('unlocked','withdrawal_locked','withdrawal_unlocked','withdrawal_completed') THEN ct.amount ELSE 0 END), 0) AS incoming,
    COALESCE(SUM(CASE WHEN ct.amount < 0 AND ct.type NOT IN ('locked','locked_superseded','offer_accepted','offer_superseded','order','order_accepted','withdrawal_locked','withdrawal_unlocked','withdrawal_completed') THEN ABS(ct.amount) ELSE 0 END), 0) AS outgoing,
    COALESCE(SUM(CASE WHEN ct.type = 'withdrawal_locked' THEN ABS(ct.amount) ELSE 0 END), 0) AS w_locked,
    COALESCE(SUM(CASE WHEN ct.type = 'withdrawal_unlocked' THEN ABS(ct.amount) ELSE 0 END), 0) AS w_unlocked,
    COALESCE(SUM(CASE WHEN ct.type = 'withdrawal_completed' THEN ABS(ct.amount) ELSE 0 END), 0) AS w_completed
  FROM public.credit_transactions ct
  GROUP BY ct.user_id
)
UPDATE public.user_credits uc
SET credits = r.incoming - r.outgoing - (GREATEST(0, r.w_locked - r.w_unlocked - r.w_completed) + r.w_completed),
    updated_at = now()
FROM recalc r
WHERE uc.user_id = r.user_id;
