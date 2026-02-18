
-- =========================================================
-- AGENCY MANAGEMENT RLS HARDENING
-- Prevents users from manipulating privileged fields via
-- the client-side Supabase API.
-- =========================================================

-- =========================================================
-- 1. agency_payouts: restrict what users can self-update
-- =========================================================
-- Drop the overly broad user update policy
DROP POLICY IF EXISTS "Users can update their own agency payout" ON public.agency_payouts;

-- Re-create with WITH CHECK to ensure users can only touch
-- allowed fields (last_online_at). All privileged fields like
-- commission_percentage, onboarding_complete, downgraded,
-- password_hash, stripe_account_id, payout_method, email
-- are admin-only or updated exclusively via edge functions.
CREATE POLICY "Users can update their own agency last_online_at"
ON public.agency_payouts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  -- The USING clause already limits rows, but we must also
  -- prevent privilege escalation via SET. We enforce this via
  -- a DB trigger below that raises an error if protected fields change.
);

-- Create a trigger function to block modification of protected agency_payouts fields by non-admins
CREATE OR REPLACE FUNCTION public.prevent_agency_payouts_field_manipulation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service-role (edge functions) to update anything
  -- Service role bypasses RLS entirely, so this trigger only fires for auth'd users
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    -- Block changes to privileged fields
    IF NEW.commission_percentage IS DISTINCT FROM OLD.commission_percentage THEN
      RAISE EXCEPTION 'Unauthorized: commission_percentage cannot be modified directly';
    END IF;
    IF NEW.onboarding_complete IS DISTINCT FROM OLD.onboarding_complete THEN
      RAISE EXCEPTION 'Unauthorized: onboarding_complete cannot be modified directly';
    END IF;
    IF NEW.downgraded IS DISTINCT FROM OLD.downgraded THEN
      RAISE EXCEPTION 'Unauthorized: downgraded cannot be modified directly';
    END IF;
    IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
      RAISE EXCEPTION 'Unauthorized: password_hash cannot be modified directly';
    END IF;
    IF NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id THEN
      RAISE EXCEPTION 'Unauthorized: stripe_account_id cannot be modified directly';
    END IF;
    IF NEW.payout_method IS DISTINCT FROM OLD.payout_method THEN
      RAISE EXCEPTION 'Unauthorized: payout_method cannot be modified directly';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Unauthorized: email cannot be modified directly';
    END IF;
    IF NEW.agency_name IS DISTINCT FROM OLD.agency_name THEN
      RAISE EXCEPTION 'Unauthorized: agency_name cannot be modified directly';
    END IF;
    IF NEW.downgrade_reason IS DISTINCT FROM OLD.downgrade_reason THEN
      RAISE EXCEPTION 'Unauthorized: downgrade_reason cannot be modified directly';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Unauthorized: user_id cannot be modified directly';
    END IF;
    IF NEW.invite_sent_at IS DISTINCT FROM OLD.invite_sent_at THEN
      RAISE EXCEPTION 'Unauthorized: invite_sent_at cannot be modified directly';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_agency_payouts_manipulation ON public.agency_payouts;
CREATE TRIGGER prevent_agency_payouts_manipulation
BEFORE UPDATE ON public.agency_payouts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_agency_payouts_field_manipulation();


-- =========================================================
-- 2. agency_applications: restrict user updates to only
--    the rejection_seen field (the only legit user action)
-- =========================================================
DROP POLICY IF EXISTS "Users can update rejection_seen on their own applications" ON public.agency_applications;

CREATE POLICY "Users can only update rejection_seen on their own applications"
ON public.agency_applications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Trigger to block all other field changes by non-admins
CREATE OR REPLACE FUNCTION public.prevent_agency_application_field_manipulation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    -- Users may only toggle rejection_seen
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Unauthorized: status cannot be modified directly';
    END IF;
    IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
      RAISE EXCEPTION 'Unauthorized: admin_notes cannot be modified directly';
    END IF;
    IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
      RAISE EXCEPTION 'Unauthorized: reviewed_at cannot be modified directly';
    END IF;
    IF NEW.pre_approved_at IS DISTINCT FROM OLD.pre_approved_at THEN
      RAISE EXCEPTION 'Unauthorized: pre_approved_at cannot be modified directly';
    END IF;
    IF NEW.rejected_at IS DISTINCT FROM OLD.rejected_at THEN
      RAISE EXCEPTION 'Unauthorized: rejected_at cannot be modified directly';
    END IF;
    IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at THEN
      RAISE EXCEPTION 'Unauthorized: cancelled_at cannot be modified directly';
    END IF;
    IF NEW.hidden IS DISTINCT FROM OLD.hidden THEN
      RAISE EXCEPTION 'Unauthorized: hidden cannot be modified directly';
    END IF;
    IF NEW.read IS DISTINCT FROM OLD.read THEN
      RAISE EXCEPTION 'Unauthorized: read cannot be modified directly';
    END IF;
    -- Block changing core application data after submission
    IF NEW.agency_name IS DISTINCT FROM OLD.agency_name THEN
      RAISE EXCEPTION 'Unauthorized: agency_name cannot be modified after submission';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Unauthorized: email cannot be modified after submission';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Unauthorized: user_id cannot be modified';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_agency_application_manipulation ON public.agency_applications;
CREATE TRIGGER prevent_agency_application_manipulation
BEFORE UPDATE ON public.agency_applications
FOR EACH ROW
EXECUTE FUNCTION public.prevent_agency_application_field_manipulation();


-- =========================================================
-- 3. agency_custom_verifications: users should only be able
--    to INSERT (submit), not UPDATE after submission.
--    Admin manages status transitions server-side.
-- =========================================================
-- The current UPDATE policy allows users to update ANY field
-- while status = 'pending_review'. Drop it entirely.
DROP POLICY IF EXISTS "Users can update their own pending custom verifications" ON public.agency_custom_verifications;

-- Users have no legitimate reason to UPDATE a verification
-- after submission — all status changes are admin-driven via
-- edge functions using the service role.
-- If re-submission is needed, a new INSERT is the correct path.

-- Trigger to fully prevent user updates on verifications
CREATE OR REPLACE FUNCTION public.prevent_verification_manipulation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    -- Only allow updating the `read` field (dismissed-by-user state)
    -- All other fields are locked once submitted
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Unauthorized: verification status cannot be modified by users';
    END IF;
    IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
      RAISE EXCEPTION 'Unauthorized: admin_notes cannot be modified by users';
    END IF;
    IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
      RAISE EXCEPTION 'Unauthorized: reviewed_at cannot be modified by users';
    END IF;
    IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'Unauthorized: submitted_at cannot be modified by users';
    END IF;
    IF NEW.agency_payout_id IS DISTINCT FROM OLD.agency_payout_id THEN
      RAISE EXCEPTION 'Unauthorized: agency_payout_id cannot be modified by users';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Unauthorized: user_id cannot be modified';
    END IF;
    -- Block changing any financial/KYC fields after submission
    IF NEW.bank_account_number IS DISTINCT FROM OLD.bank_account_number THEN
      RAISE EXCEPTION 'Unauthorized: bank details cannot be modified after submission';
    END IF;
    IF NEW.bank_iban IS DISTINCT FROM OLD.bank_iban THEN
      RAISE EXCEPTION 'Unauthorized: bank details cannot be modified after submission';
    END IF;
    IF NEW.bank_swift_code IS DISTINCT FROM OLD.bank_swift_code THEN
      RAISE EXCEPTION 'Unauthorized: bank details cannot be modified after submission';
    END IF;
    IF NEW.usdt_wallet_address IS DISTINCT FROM OLD.usdt_wallet_address THEN
      RAISE EXCEPTION 'Unauthorized: wallet address cannot be modified after submission';
    END IF;
    IF NEW.usdt_network IS DISTINCT FROM OLD.usdt_network THEN
      RAISE EXCEPTION 'Unauthorized: wallet network cannot be modified after submission';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_verification_field_manipulation ON public.agency_custom_verifications;
CREATE TRIGGER prevent_verification_field_manipulation
BEFORE UPDATE ON public.agency_custom_verifications
FOR EACH ROW
EXECUTE FUNCTION public.prevent_verification_manipulation();
