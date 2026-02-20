
CREATE OR REPLACE FUNCTION public.check_active_session(check_email text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT active_session_id
  FROM public.profiles
  WHERE email = check_email
    AND active_session_id IS NOT NULL
    AND last_online_at IS NOT NULL
    AND last_online_at > now() - interval '45 seconds'
  LIMIT 1;
$function$;
