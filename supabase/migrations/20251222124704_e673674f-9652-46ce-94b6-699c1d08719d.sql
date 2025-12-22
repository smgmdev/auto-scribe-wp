-- Allow agencies to delete their own messages (for canceling order requests)
CREATE POLICY "Agencies can delete their own messages"
ON public.service_messages
FOR DELETE
USING (
  sender_type = 'agency' 
  AND EXISTS (
    SELECT 1
    FROM service_requests sr
    JOIN agency_payouts ap ON ap.id = sr.agency_payout_id
    WHERE sr.id = service_messages.request_id
    AND ap.user_id = auth.uid()
  )
);