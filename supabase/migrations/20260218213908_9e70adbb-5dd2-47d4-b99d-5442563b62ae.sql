
-- Block direct client writes to PIN and sensitive security fields on profiles.
-- Only service-role (edge functions) can update these columns.

CREATE OR REPLACE FUNCTION public.prevent_profile_security_field_manipulation()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow service-role (edge functions) — they bypass RLS entirely, so this
  -- trigger only fires for authenticated user sessions.
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    -- PIN fields must only be written via the manage-pin edge function (service role)
    IF NEW.pin_hash IS DISTINCT FROM OLD.pin_hash THEN
      RAISE EXCEPTION 'Unauthorized: pin_hash cannot be modified directly';
    END IF;
    IF NEW.pin_salt IS DISTINCT FROM OLD.pin_salt THEN
      RAISE EXCEPTION 'Unauthorized: pin_salt cannot be modified directly';
    END IF;
    IF NEW.pin_enabled IS DISTINCT FROM OLD.pin_enabled THEN
      RAISE EXCEPTION 'Unauthorized: pin_enabled cannot be modified directly';
    END IF;
    -- Block elevation of privileges
    IF NEW.suspended IS DISTINCT FROM OLD.suspended THEN
      RAISE EXCEPTION 'Unauthorized: suspended cannot be modified directly';
    END IF;
    IF NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
      RAISE EXCEPTION 'Unauthorized: email_verified cannot be modified directly';
    END IF;
    IF NEW.verification_token IS DISTINCT FROM OLD.verification_token THEN
      RAISE EXCEPTION 'Unauthorized: verification_token cannot be modified directly';
    END IF;
    IF NEW.verification_token_expires_at IS DISTINCT FROM OLD.verification_token_expires_at THEN
      RAISE EXCEPTION 'Unauthorized: verification_token_expires_at cannot be modified directly';
    END IF;
    -- Users cannot change their own email or id via profile (auth handles email)
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Unauthorized: email cannot be modified via profile directly';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Unauthorized: id cannot be modified';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger to profiles table
DROP TRIGGER IF EXISTS prevent_profile_security_field_manipulation_trigger ON public.profiles;
CREATE TRIGGER prevent_profile_security_field_manipulation_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_security_field_manipulation();

-- Add brute-force tracking table for PIN attempts
CREATE TABLE IF NOT EXISTS public.pin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  attempted_at timestamp with time zone NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);

ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;

-- Only service role can write; no client access at all
CREATE POLICY "No direct client access to pin_attempts"
  ON public.pin_attempts
  FOR ALL
  USING (false)
  WITH CHECK (false);
