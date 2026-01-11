-- Allow agencies to create disputes for orders associated with their service requests
CREATE POLICY "Agencies can create disputes for their requests" 
ON public.disputes 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM service_requests sr
    JOIN agency_payouts ap ON sr.agency_payout_id = ap.id
    WHERE sr.id = disputes.service_request_id
    AND ap.user_id = auth.uid()
  )
);