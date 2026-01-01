-- Allow agencies to view disputes for orders linked to their assigned service requests
CREATE POLICY "Agencies can view disputes for their assigned requests"
ON public.disputes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    JOIN public.agency_payouts ap ON sr.agency_payout_id = ap.id
    WHERE sr.id = disputes.service_request_id
    AND ap.user_id = auth.uid()
  )
);