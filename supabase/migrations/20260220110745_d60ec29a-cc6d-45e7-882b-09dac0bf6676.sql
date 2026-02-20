
-- Add active_session_id column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_session_id text;

-- Create function to check active session by email (callable without auth)
CREATE OR REPLACE FUNCTION public.check_active_session(check_email text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT active_session_id
  FROM public.profiles
  WHERE email = check_email
  LIMIT 1;
$$;
