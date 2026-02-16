-- Drop the permissive SELECT policy that exposes PII to all authenticated users
DROP POLICY IF EXISTS "Authenticated users can view approved applications" ON public.agency_applications;