-- Allow agencies to update the read status on disputes for their assigned requests
CREATE POLICY "Agencies can update disputes for their assigned requests"
ON public.disputes
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    JOIN public.agency_payouts ap ON sr.agency_payout_id = ap.id
    WHERE sr.id = disputes.service_request_id
    AND ap.user_id = auth.uid()
  )
);