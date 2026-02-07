-- Create a function to automatically create withdrawal_locked transaction when a withdrawal is inserted
CREATE OR REPLACE FUNCTION public.handle_new_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert a withdrawal_locked credit transaction
  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (
    NEW.user_id,
    -NEW.amount_cents,  -- Negative to indicate locked funds (stored in cents)
    'withdrawal_locked',
    'Credits locked for withdrawal - ' || CASE WHEN NEW.withdrawal_method = 'bank' THEN 'Bank Transfer' ELSE 'USDT' END
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger to fire after a new withdrawal is inserted
DROP TRIGGER IF EXISTS on_withdrawal_created ON public.agency_withdrawals;
CREATE TRIGGER on_withdrawal_created
  AFTER INSERT ON public.agency_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_withdrawal();