
-- Add session_started_at to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS session_started_at timestamptz;

-- Update register_active_session to also set session_started_at
CREATE OR REPLACE FUNCTION public.register_active_session(_user_id uuid, _session_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.profiles
  SET active_session_id = _session_id,
      session_started_at = now()
  WHERE id = _user_id;
END;
$function$;
