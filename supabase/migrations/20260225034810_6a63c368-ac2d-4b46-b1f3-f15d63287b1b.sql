
-- Fix check_user_status: Do NOT cross-check auth.users.email_confirmed_at
-- because auto_confirm_email is enabled, so that field is always set immediately.
-- Only trust profiles.email_verified which is set by our custom verify-email edge function.
CREATE OR REPLACE FUNCTION public.check_user_status(check_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_record RECORD;
BEGIN
  SELECT id, email_verified INTO user_record
  FROM public.profiles
  WHERE email = check_email;
  
  IF user_record IS NULL THEN
    RETURN 'not_found';
  END IF;

  IF user_record.email_verified = true THEN
    RETURN 'verified';
  END IF;

  RETURN 'unverified';
END;
$function$;

-- Fix check_email_verified: same logic, only trust profiles.email_verified
CREATE OR REPLACE FUNCTION public.check_email_verified(check_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  profile_verified boolean;
BEGIN
  SELECT email_verified INTO profile_verified
  FROM public.profiles
  WHERE email = check_email
  LIMIT 1;

  RETURN COALESCE(profile_verified, false);
END;
$function$;
