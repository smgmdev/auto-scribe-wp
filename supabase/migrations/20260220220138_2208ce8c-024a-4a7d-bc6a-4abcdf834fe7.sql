
-- Create a SECURITY DEFINER function to reliably register active sessions
-- This bypasses RLS and guarantees the update works
CREATE OR REPLACE FUNCTION public.register_active_session(_user_id uuid, _session_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.profiles
  SET active_session_id = _session_id
  WHERE id = _user_id;
END;
$function$;
