-- Allow agencies to update price and about on their own media sites
CREATE POLICY "Agencies can update their own media sites"
ON public.media_sites
FOR UPDATE
USING (
  agency IN (
    SELECT agency_name FROM public.agency_payouts WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  agency IN (
    SELECT agency_name FROM public.agency_payouts WHERE user_id = auth.uid()
  )
);