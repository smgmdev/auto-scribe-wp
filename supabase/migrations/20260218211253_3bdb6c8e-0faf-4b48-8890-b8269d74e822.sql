
-- 1. Create a security-definer function to check credit history
--    Uses STABLE + SECURITY DEFINER so it can't be spoofed by the caller
CREATE OR REPLACE FUNCTION public.has_credit_history(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.credit_transactions
    WHERE user_id = _user_id
      AND type NOT IN ('withdrawal_locked', 'withdrawal_completed')
    LIMIT 1
  );
$$;

-- 2. Drop the permissive INSERT policy that allows any authenticated user to create a ticket
DROP POLICY IF EXISTS "Users can create their own tickets" ON public.support_tickets;

-- 3. Re-create INSERT policy — now gated on credit history
CREATE POLICY "Users with credit history can create tickets"
  ON public.support_tickets
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_credit_history(auth.uid())
  );

-- 4. Also gate support_messages INSERT — prevent direct message injection
--    even if someone found an existing ticket id
DROP POLICY IF EXISTS "Users can create messages for their tickets" ON public.support_messages;

CREATE POLICY "Users with credit history can send support messages"
  ON public.support_messages
  FOR INSERT
  WITH CHECK (
    public.has_credit_history(auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.support_tickets
        WHERE support_tickets.id = support_messages.ticket_id
          AND support_tickets.user_id = auth.uid()
      )
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );
