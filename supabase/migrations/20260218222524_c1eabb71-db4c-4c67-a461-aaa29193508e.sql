
-- Create a SECURITY DEFINER function that returns WordPress submissions without credentials
-- This prevents users from ever reading back username/app_password via client queries
CREATE OR REPLACE FUNCTION public.get_my_wp_submissions(_user_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  url text,
  seo_plugin text,
  status text,
  admin_notes text,
  logo_url text,
  read boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  reviewed_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, name, url, seo_plugin, status, admin_notes, logo_url,
    read, created_at, updated_at, reviewed_at
  FROM public.wordpress_site_submissions
  WHERE user_id = _user_id;
$$;

-- Drop the existing broad user SELECT policy that exposes credentials
DROP POLICY IF EXISTS "Users can view their own WordPress submissions" ON public.wordpress_site_submissions;

-- Replace with a deny-all SELECT policy for regular users
-- (Admins still have full access via "Admins can manage all WordPress submissions")
-- Users must go through the get_my_wp_submissions() RPC to read their submissions
CREATE POLICY "No direct client SELECT on wp submissions"
ON public.wordpress_site_submissions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));
