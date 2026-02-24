
-- Fix: check_user_status should also check auth.users.email_confirmed_at
-- and auto-sync profiles.email_verified when Supabase has confirmed the email
CREATE OR REPLACE FUNCTION public.check_user_status(check_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_record RECORD;
  auth_confirmed boolean;
BEGIN
  -- Check if profile exists with this email
  SELECT id, email_verified INTO user_record
  FROM public.profiles
  WHERE email = check_email;
  
  IF user_record IS NULL THEN
    RETURN 'not_found';
  END IF;

  -- If already verified in profiles, return immediately
  IF user_record.email_verified = true THEN
    RETURN 'verified';
  END IF;

  -- Profile says unverified — cross-check with auth.users
  SELECT (email_confirmed_at IS NOT NULL) INTO auth_confirmed
  FROM auth.users
  WHERE email = check_email
  LIMIT 1;

  IF auth_confirmed = true THEN
    -- Supabase confirmed the email but profiles wasn't synced — fix it now
    UPDATE public.profiles
    SET email_verified = true,
        verification_token = NULL,
        verification_token_expires_at = NULL
    WHERE id = user_record.id;

    RETURN 'verified';
  END IF;

  RETURN 'unverified';
END;
$function$;

-- Also fix check_email_verified to be consistent
CREATE OR REPLACE FUNCTION public.check_email_verified(check_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  profile_verified boolean;
  auth_confirmed boolean;
BEGIN
  SELECT email_verified INTO profile_verified
  FROM public.profiles
  WHERE email = check_email
  LIMIT 1;

  IF profile_verified = true THEN
    RETURN true;
  END IF;

  -- Cross-check auth.users
  SELECT (email_confirmed_at IS NOT NULL) INTO auth_confirmed
  FROM auth.users
  WHERE email = check_email
  LIMIT 1;

  RETURN COALESCE(auth_confirmed, false);
END;
$function$;
