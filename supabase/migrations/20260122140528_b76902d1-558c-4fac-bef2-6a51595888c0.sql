-- Fix 1: Remove the public policy that exposes PII and create a SECURITY DEFINER function
-- Drop the existing unauthenticated public policy
DROP POLICY IF EXISTS "Anyone can view approved applications" ON agency_applications;

-- The authenticated policy already exists, so keep it
-- CREATE POLICY "Authenticated users can view approved applications" already exists

-- Create a SECURITY DEFINER function to return only non-sensitive agency data for public display
CREATE OR REPLACE FUNCTION public.get_public_agencies()
RETURNS TABLE(
  id uuid,
  agency_name text,
  logo_url text,
  country text,
  media_niches text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    agency_name,
    logo_url,
    country,
    media_niches
  FROM public.agency_applications
  WHERE status = 'approved'
  ORDER BY created_at ASC
$$;