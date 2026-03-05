CREATE OR REPLACE FUNCTION public.prevent_profile_security_field_manipulation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow service-role (edge functions) — auth.uid() is NULL for service-role calls
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.pin_hash IS DISTINCT FROM OLD.pin_hash THEN
      RAISE EXCEPTION 'Unauthorized: pin_hash cannot be modified directly';
    END IF;
    IF NEW.pin_salt IS DISTINCT FROM OLD.pin_salt THEN
      RAISE EXCEPTION 'Unauthorized: pin_salt cannot be modified directly';
    END IF;
    IF NEW.pin_enabled IS DISTINCT FROM OLD.pin_enabled THEN
      RAISE EXCEPTION 'Unauthorized: pin_enabled cannot be modified directly';
    END IF;
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
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'Unauthorized: email cannot be modified via profile directly';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Unauthorized: id cannot be modified';
    END IF;
    IF NEW.precision_enabled IS DISTINCT FROM OLD.precision_enabled THEN
      RAISE EXCEPTION 'Unauthorized: precision_enabled cannot be modified directly';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;