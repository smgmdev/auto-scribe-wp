-- Allow agencies to view service requests assigned to them
CREATE POLICY "Agencies can view their assigned requests"
ON public.service_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.agency_payouts ap
    WHERE ap.id = service_requests.agency_payout_id
    AND ap.user_id = auth.uid()
  )
);

-- Allow agencies to update service requests assigned to them
CREATE POLICY "Agencies can update their assigned requests"
ON public.service_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.agency_payouts ap
    WHERE ap.id = service_requests.agency_payout_id
    AND ap.user_id = auth.uid()
  )
);

-- Allow agencies to view messages for their requests
CREATE POLICY "Agencies can view messages for their requests"
ON public.service_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    JOIN public.agency_payouts ap ON ap.id = sr.agency_payout_id
    WHERE sr.id = service_messages.request_id
    AND ap.user_id = auth.uid()
  )
);

-- Allow agencies to create messages for their requests
CREATE POLICY "Agencies can create messages for their requests"
ON public.service_messages
FOR INSERT
WITH CHECK (
  sender_type = 'agency' AND
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    JOIN public.agency_payouts ap ON ap.id = sr.agency_payout_id
    WHERE sr.id = service_messages.request_id
    AND ap.user_id = auth.uid()
  )
);