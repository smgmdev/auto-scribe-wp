-- Add suspended column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN suspended boolean NOT NULL DEFAULT false;

-- Create function to check if user is suspended
CREATE OR REPLACE FUNCTION public.check_user_suspended(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT suspended FROM public.profiles WHERE email = check_email LIMIT 1),
    false
  )
$$;