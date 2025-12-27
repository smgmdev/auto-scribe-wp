-- Add UPDATE policy for users to update their own agency_payouts record (for last_online_at)
CREATE POLICY "Users can update their own agency payout"
ON public.agency_payouts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);