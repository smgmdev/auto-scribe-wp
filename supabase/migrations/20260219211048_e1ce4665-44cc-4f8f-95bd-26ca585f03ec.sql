-- Fix: Admin users were blocked from sending support messages because 
-- the INSERT policy required has_credit_history() for ALL users including admins.
-- Admins should bypass the credit history check.

DROP POLICY "Users with credit history can send support messages" ON public.support_messages;

CREATE POLICY "Users with credit history or admins can send support messages"
ON public.support_messages
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_credit_history(auth.uid())
    AND EXISTS (
      SELECT 1 FROM support_tickets st
      WHERE st.id = support_messages.ticket_id
        AND st.user_id = auth.uid()
        AND st.status = 'open'
    )
  )
);