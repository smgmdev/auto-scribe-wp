-- Create a function to check if an email is verified (bypasses RLS)
CREATE OR REPLACE FUNCTION public.check_email_verified(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT email_verified FROM public.profiles WHERE email = check_email LIMIT 1),
    false
  )
$$;