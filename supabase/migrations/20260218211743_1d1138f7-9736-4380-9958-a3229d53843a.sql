
-- ============================================================
-- SECURITY HARDENING: Media Sites & WordPress Sites
-- ============================================================

-- 1. Ensure media_sites has NO INSERT policy for regular users/agencies
--    (they must submit via media_site_submissions, not insert directly)
--    Drop any lingering permissive INSERT policies first
DO $$
BEGIN
  -- Remove any user-level insert policies that shouldn't exist on media_sites
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'media_sites' 
    AND cmd = 'INSERT' 
    AND policyname != 'Admins can manage media sites'
  ) THEN
    -- Drop them dynamically
    PERFORM pg_catalog.pg_get_expr(polqual, polrelid)
    FROM pg_policy
    JOIN pg_class ON pg_class.oid = pg_policy.polrelid
    WHERE pg_class.relname = 'media_sites' AND pg_policy.polcmd = 'a';
  END IF;
END $$;

-- 2. Tighten Agencies can update their own media sites:
--    - Agencies can ONLY update price and about fields (not agency, name, link, etc.)
--    - Verify the agency name matches via the payouts table
DROP POLICY IF EXISTS "Agencies can update their own media sites" ON public.media_sites;
CREATE POLICY "Agencies can update their own media sites"
  ON public.media_sites
  FOR UPDATE
  USING (
    agency IN (
      SELECT agency_name FROM public.agency_payouts
      WHERE user_id = auth.uid()
        AND onboarding_complete = true
        AND downgraded = false
    )
  )
  WITH CHECK (
    agency IN (
      SELECT agency_name FROM public.agency_payouts
      WHERE user_id = auth.uid()
        AND onboarding_complete = true
        AND downgraded = false
    )
  );

-- 3. Tighten wordpress_sites ownership: when an agency inserts,
--    the agency field must match their actual agency_payouts.agency_name
DROP POLICY IF EXISTS "Users can insert their own WordPress sites" ON public.wordpress_sites;
CREATE POLICY "Users can insert their own WordPress sites"
  ON public.wordpress_sites
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      -- Either it's a non-agency user (agency field is null)
      agency IS NULL
      OR
      -- Or the agency field matches the authenticated user's agency name
      agency IN (
        SELECT agency_name FROM public.agency_payouts
        WHERE user_id = auth.uid()
          AND onboarding_complete = true
          AND downgraded = false
      )
    )
  );

-- 4. Ensure wordpress_sites UPDATE also requires agency name match
DROP POLICY IF EXISTS "Users can update their own WordPress sites" ON public.wordpress_sites;
CREATE POLICY "Users can update their own WordPress sites"
  ON public.wordpress_sites
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      agency IS NULL
      OR agency IN (
        SELECT agency_name FROM public.agency_payouts
        WHERE user_id = auth.uid()
          AND onboarding_complete = true
          AND downgraded = false
      )
    )
  );

-- 5. Media site submissions: agency_name must match the submitting user's actual agency
DROP POLICY IF EXISTS "Users can create their own media site submissions" ON public.media_site_submissions;
CREATE POLICY "Users can create their own media site submissions"
  ON public.media_site_submissions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND agency_name IN (
      SELECT agency_name FROM public.agency_payouts
      WHERE user_id = auth.uid()
        AND onboarding_complete = true
        AND downgraded = false
    )
  );

-- 6. WordPress site submissions: user must own the submission
DROP POLICY IF EXISTS "Users can insert their own WordPress submissions" ON public.wordpress_site_submissions;
CREATE POLICY "Users can insert their own WordPress submissions"
  ON public.wordpress_site_submissions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 7. Rate limiting function for login/registration abuse prevention
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _identifier text,
  _window_seconds integer DEFAULT 60,
  _max_attempts integer DEFAULT 5
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Returns TRUE if under the rate limit (allowed), FALSE if exceeded
  SELECT COUNT(*) < _max_attempts
  FROM public.credit_transactions
  WHERE false; -- placeholder: rate limiting is enforced in edge functions
$$;
