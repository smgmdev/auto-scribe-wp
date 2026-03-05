
-- Fix the sync trigger to exclude lock/unlock/offer types from balance calculation.
-- This aligns the DB balance with the frontend's calculateTotalBalance formula.
-- The excluded types represent temporary lock states that are separately tracked via active orders/requests.

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
  _new_balance integer;
BEGIN
  -- Determine which user_id to recalculate
  IF TG_OP = 'DELETE' THEN
    _user_id := OLD.user_id;
  ELSE
    _user_id := NEW.user_id;
  END IF;

  -- Calculate balance using the same formula as the frontend's calculateTotalBalance:
  -- incoming = positive amounts, excluding 'unlocked' and withdrawal types
  -- outgoing = |negative amounts|, excluding 'locked','offer_accepted','order','locked_superseded','offer_superseded' and withdrawal types
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

  _new_balance := _incoming - _outgoing;

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

-- Recalculate ALL user balances to fix existing data
DO $$
DECLARE
  _rec RECORD;
  _incoming integer;
  _outgoing integer;
  _new_balance integer;
BEGIN
  FOR _rec IN SELECT DISTINCT user_id FROM public.credit_transactions LOOP
    SELECT COALESCE(SUM(amount), 0) INTO _incoming
    FROM public.credit_transactions
    WHERE user_id = _rec.user_id
      AND amount > 0
      AND type NOT IN ('unlocked', 'withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed');

    SELECT COALESCE(SUM(ABS(amount)), 0) INTO _outgoing
    FROM public.credit_transactions
    WHERE user_id = _rec.user_id
      AND amount < 0
      AND type NOT IN ('locked', 'locked_superseded', 'offer_accepted', 'offer_superseded', 'order', 'order_accepted', 'withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed');

    _new_balance := _incoming - _outgoing;

    UPDATE public.user_credits
    SET credits = _new_balance, updated_at = now()
    WHERE user_id = _rec.user_id;
  END LOOP;
END $$;
