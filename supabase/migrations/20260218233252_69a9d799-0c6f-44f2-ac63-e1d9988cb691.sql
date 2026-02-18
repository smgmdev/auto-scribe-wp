-- Fix: The "Admins can manage sites" ALL policy conflicts with the 
-- "Users can view their own WordPress sites" SELECT policy because both
-- must pass for SELECT (PostgreSQL AND logic for same command).
-- Solution: Drop the user SELECT policy and replace it with one that
-- also allows admins (or sites with null user_id for admin-managed sites).

DROP POLICY IF EXISTS "Users can view their own WordPress sites" ON public.wordpress_sites;

CREATE POLICY "Users can view their own WordPress sites"
ON public.wordpress_sites
FOR SELECT
USING (
  auth.uid() = user_id 
  OR has_role(auth.uid(), 'admin'::app_role)
);