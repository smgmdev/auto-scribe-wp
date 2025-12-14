-- Add policy to allow users to update rejection_seen on their own applications
CREATE POLICY "Users can update rejection_seen on their own applications"
ON public.agency_applications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);