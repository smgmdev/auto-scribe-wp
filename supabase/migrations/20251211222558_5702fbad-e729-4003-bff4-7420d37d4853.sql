-- Remove the overly permissive policy that exposes credentials
DROP POLICY IF EXISTS "Authenticated users can view sites" ON public.wordpress_sites;

-- Create a SECURITY DEFINER function that returns only public site data
-- This allows regular users to see sites without exposing credentials
CREATE OR REPLACE FUNCTION public.get_public_sites()
RETURNS TABLE (
  id uuid,
  name text,
  url text,
  seo_plugin text,
  favicon text,
  connected boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    name,
    url,
    seo_plugin,
    favicon,
    connected
  FROM public.wordpress_sites
  ORDER BY created_at ASC
$$;