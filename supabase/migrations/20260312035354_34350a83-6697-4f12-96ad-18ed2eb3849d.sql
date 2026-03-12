
CREATE POLICY "Service role can manage SIPRI data"
  ON public.sipri_arms_transfers
  FOR ALL
  USING (true)
  WITH CHECK (true);
