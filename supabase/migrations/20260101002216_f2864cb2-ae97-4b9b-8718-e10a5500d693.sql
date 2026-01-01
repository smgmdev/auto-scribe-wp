-- Allow agencies to update the read status on orders for their assigned requests
CREATE POLICY "Agencies can update orders for their assigned requests"
ON public.orders
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr
    JOIN public.agency_payouts ap ON sr.agency_payout_id = ap.id
    WHERE sr.order_id = orders.id
    AND ap.user_id = auth.uid()
  )
);