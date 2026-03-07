
CREATE OR REPLACE FUNCTION public.check_active_session(check_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _profile RECORD;
  _stale_threshold interval := interval '5 minutes';
  _has_auth_session boolean;
BEGIN
  SELECT id, active_session_id, last_online_at
  INTO _profile
  FROM public.profiles
  WHERE email = check_email
    AND active_session_id IS NOT NULL
  LIMIT 1;

  IF _profile IS NULL THEN
    RETURN NULL;
  END IF;

  -- If last_online_at is older than 5 minutes, the session is stale — auto-clear it
  IF _profile.last_online_at IS NULL OR _profile.last_online_at < (now() - _stale_threshold) THEN
    UPDATE public.profiles
    SET active_session_id = NULL
    WHERE id = _profile.id;
    RETURN NULL;
  END IF;

  -- Cross-check: does the user actually have any live auth sessions?
  SELECT EXISTS (
    SELECT 1 FROM auth.sessions WHERE user_id = _profile.id
  ) INTO _has_auth_session;

  IF NOT _has_auth_session THEN
    UPDATE public.profiles
    SET active_session_id = NULL
    WHERE id = _profile.id;
    RETURN NULL;
  END IF;

  RETURN _profile.active_session_id;
END;
$function$;
