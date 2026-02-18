
-- ============================================================
-- SECURITY HARDENING: Chat Message Insert Policies
-- Prevents messages being sent to cancelled engagements or
-- closed support tickets, and ensures strict ownership checks.
-- ============================================================

-- ─── service_messages ───────────────────────────────────────

-- Drop existing insert policies
DROP POLICY IF EXISTS "Users can create messages for their requests" ON public.service_messages;
DROP POLICY IF EXISTS "Agencies can create messages for their requests" ON public.service_messages;

-- Recreate: Client INSERT — must own the request AND engagement must NOT be cancelled
CREATE POLICY "Users can create messages for their requests"
ON public.service_messages
FOR INSERT
WITH CHECK (
  sender_type = 'client'
  AND EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = service_messages.request_id
      AND sr.user_id = auth.uid()
      AND sr.status != 'cancelled'
  )
);

-- Recreate: Agency INSERT — must be assigned agency AND engagement must NOT be cancelled
CREATE POLICY "Agencies can create messages for their requests"
ON public.service_messages
FOR INSERT
WITH CHECK (
  sender_type = 'agency'
  AND EXISTS (
    SELECT 1
    FROM public.service_requests sr
    JOIN public.agency_payouts ap ON (ap.id = sr.agency_payout_id)
    WHERE sr.id = service_messages.request_id
      AND ap.user_id = auth.uid()
      AND sr.status != 'cancelled'
  )
);

-- ─── service_messages SELECT ─────────────────────────────────
-- Ensure cross-user access is not possible:
-- Users can only SELECT messages for their own requests

DROP POLICY IF EXISTS "Users can view messages for their requests" ON public.service_messages;

CREATE POLICY "Users can view messages for their requests"
ON public.service_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = service_messages.request_id
      AND sr.user_id = auth.uid()
  )
);

-- ─── service_messages DELETE ─────────────────────────────────
-- Users can only delete their own messages in non-cancelled requests

DROP POLICY IF EXISTS "Users can delete messages for their own requests" ON public.service_messages;
DROP POLICY IF EXISTS "Agencies can delete their own messages" ON public.service_messages;

CREATE POLICY "Users can delete messages for their own requests"
ON public.service_messages
FOR DELETE
USING (
  sender_type = 'client'
  AND EXISTS (
    SELECT 1 FROM public.service_requests sr
    WHERE sr.id = service_messages.request_id
      AND sr.user_id = auth.uid()
      AND sr.status != 'cancelled'
  )
);

CREATE POLICY "Agencies can delete their own messages"
ON public.service_messages
FOR DELETE
USING (
  sender_type = 'agency'
  AND EXISTS (
    SELECT 1
    FROM public.service_requests sr
    JOIN public.agency_payouts ap ON (ap.id = sr.agency_payout_id)
    WHERE sr.id = service_messages.request_id
      AND ap.user_id = auth.uid()
      AND sr.status != 'cancelled'
  )
);

-- ─── support_messages ────────────────────────────────────────

-- Drop existing insert policy
DROP POLICY IF EXISTS "Users with credit history can send support messages" ON public.support_messages;

-- Recreate: INSERT — ticket must be OPEN and user must own the ticket (or be admin)
CREATE POLICY "Users with credit history can send support messages"
ON public.support_messages
FOR INSERT
WITH CHECK (
  has_credit_history(auth.uid())
  AND (
    -- Admin can insert into any open ticket
    has_role(auth.uid(), 'admin')
    OR
    -- User can only insert into their own open tickets
    EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = support_messages.ticket_id
        AND st.user_id = auth.uid()
        AND st.status = 'open'
    )
  )
);
