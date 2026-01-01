-- Allow agencies to view orders for service requests assigned to them
CREATE POLICY "Agencies can view orders for their assigned requests"
ON public.orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    JOIN public.agency_payouts ap ON sr.agency_payout_id = ap.id
    WHERE sr.order_id = orders.id
    AND ap.user_id = auth.uid()
  )
);