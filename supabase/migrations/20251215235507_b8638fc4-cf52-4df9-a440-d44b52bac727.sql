-- Allow users to mark their rejected submissions as read
CREATE POLICY "Users can mark their rejected submissions as read"
ON public.wordpress_site_submissions
FOR UPDATE
USING (auth.uid() = user_id AND status = 'rejected')
WITH CHECK (auth.uid() = user_id AND status = 'rejected');