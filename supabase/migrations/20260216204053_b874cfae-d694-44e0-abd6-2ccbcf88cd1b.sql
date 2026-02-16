
-- Drop the overly permissive SELECT policies that expose password_hash, stripe_account_id, etc.
DROP POLICY IF EXISTS "Anyone can view active agency payouts" ON public.agency_payouts;
DROP POLICY IF EXISTS "Authenticated users can view agency payouts" ON public.agency_payouts;

-- Create SECURITY DEFINER function to return only safe columns for active agencies
CREATE OR REPLACE FUNCTION public.get_active_agency_payouts()
RETURNS TABLE(
  id uuid,
  agency_name text,
  user_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, agency_name, user_id
  FROM public.agency_payouts
  WHERE onboarding_complete = true AND downgraded = false
  ORDER BY created_at ASC
$$;

-- Create SECURITY DEFINER function to get agency payout id by name (for service request creation)
CREATE OR REPLACE FUNCTION public.get_agency_payout_id_by_name(_agency_name text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.agency_payouts
  WHERE agency_name = _agency_name
  AND onboarding_complete = true
  AND downgraded = false
  LIMIT 1
$$;
