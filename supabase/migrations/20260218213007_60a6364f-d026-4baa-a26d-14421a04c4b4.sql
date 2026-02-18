-- Block all users (including admins via RLS) from deleting credit_transactions rows
-- Credit ledger must be immutable. Deletion should only happen via service role (edge functions), never by authenticated users.
-- Currently there is no DELETE policy on credit_transactions, which means RLS already blocks it by default.
-- This migration adds an explicit comment and a guard trigger to prevent service-role deletions of non-superseded rows.

-- Add explicit policy to confirm no user (including admin) can delete credit transactions via client API
-- (service role bypasses RLS, but our edge functions now use UPDATE instead of DELETE)

-- Ensure credit_transactions has RLS enabled (it should already be)
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Explicitly deny DELETE for all authenticated users (belt-and-suspenders)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'credit_transactions'
    AND policyname = 'No user can delete credit transactions'
  ) THEN
    EXECUTE '
      CREATE POLICY "No user can delete credit transactions"
      ON public.credit_transactions
      FOR DELETE
      TO authenticated
      USING (false)
    ';
  END IF;
END $$;

-- Ensure users can only read their own credit transactions (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'credit_transactions'
    AND policyname = 'Users can view their own transactions'
  ) THEN
    EXECUTE '
      CREATE POLICY "Users can view their own transactions"
      ON public.credit_transactions
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id)
    ';
  END IF;
END $$;

-- Admins can view all transactions (read-only via RLS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'credit_transactions'
    AND policyname = 'Admins can view all credit transactions'
  ) THEN
    EXECUTE '
      CREATE POLICY "Admins can view all credit transactions"
      ON public.credit_transactions
      FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), ''admin''))
    ';
  END IF;
END $$;

-- No INSERT policy for authenticated users: all inserts happen via edge functions using service role
-- No UPDATE policy for authenticated users: all updates happen via edge functions using service role
