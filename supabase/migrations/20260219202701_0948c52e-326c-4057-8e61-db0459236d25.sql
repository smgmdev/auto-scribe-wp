
-- Trigger function: recalculate user_credits.credits whenever a credit_transaction is inserted/updated/deleted
CREATE OR REPLACE FUNCTION public.sync_user_credits_from_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _user_id uuid;
  _new_balance integer;
BEGIN
  -- Determine which user_id to recalculate
  IF TG_OP = 'DELETE' THEN
    _user_id := OLD.user_id;
  ELSE
    _user_id := NEW.user_id;
  END IF;

  -- Sum all non-withdrawal transactions (same logic as credit-calculations.ts rawTxSum)
  SELECT COALESCE(SUM(amount), 0) INTO _new_balance
  FROM public.credit_transactions
  WHERE user_id = _user_id
    AND type NOT IN ('withdrawal_locked', 'withdrawal_unlocked', 'withdrawal_completed');

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
$$;

-- Attach trigger to credit_transactions table
CREATE TRIGGER trg_sync_user_credits
AFTER INSERT OR UPDATE OR DELETE ON public.credit_transactions
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_credits_from_ledger();
