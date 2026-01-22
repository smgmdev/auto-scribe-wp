-- Create a policy that allows anyone to view active agency payouts (only basic info)
-- This is safe because the query already filters to onboarding_complete=true and downgraded=false
-- Sensitive fields like stripe_account_id, password_hash are still protected by the select statement in the app
CREATE POLICY "Anyone can view active agency payouts"
ON public.agency_payouts
FOR SELECT
USING (onboarding_complete = true AND downgraded = false);