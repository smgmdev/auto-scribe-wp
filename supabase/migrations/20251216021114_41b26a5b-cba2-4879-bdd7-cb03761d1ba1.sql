-- Allow agencies to manage site_credits for their own WordPress sites
CREATE POLICY "Users can manage site credits for their own wordpress sites"
ON public.site_credits
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.wordpress_sites ws
    WHERE ws.id::text = site_credits.site_id
    AND ws.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.wordpress_sites ws
    WHERE ws.id::text = site_credits.site_id
    AND ws.user_id = auth.uid()
  )
);