-- Add user_id column to wordpress_sites to track agency ownership
ALTER TABLE public.wordpress_sites 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster queries
CREATE INDEX idx_wordpress_sites_user_id ON public.wordpress_sites(user_id);

-- Add RLS policy for agencies to view their own sites
CREATE POLICY "Users can view their own WordPress sites"
ON public.wordpress_sites
FOR SELECT
USING (auth.uid() = user_id);

-- Add RLS policy for agencies to insert their own sites
CREATE POLICY "Users can insert their own WordPress sites"
ON public.wordpress_sites
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Add RLS policy for agencies to update their own sites
CREATE POLICY "Users can update their own WordPress sites"
ON public.wordpress_sites
FOR UPDATE
USING (auth.uid() = user_id);

-- Add RLS policy for agencies to delete their own sites
CREATE POLICY "Users can delete their own WordPress sites"
ON public.wordpress_sites
FOR DELETE
USING (auth.uid() = user_id);