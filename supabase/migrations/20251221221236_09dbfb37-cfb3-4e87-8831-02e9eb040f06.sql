-- Create a function to check if user exists and their verification status
-- Returns: 'verified', 'unverified', or 'not_found'
CREATE OR REPLACE FUNCTION public.check_user_status(check_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_record RECORD;
BEGIN
  -- Check if profile exists with this email
  SELECT id, email_verified INTO user_record
  FROM public.profiles
  WHERE email = check_email;
  
  IF user_record IS NULL THEN
    RETURN 'not_found';
  ELSIF user_record.email_verified = true THEN
    RETURN 'verified';
  ELSE
    RETURN 'unverified';
  END IF;
END;
$$;

-- Grant execute permission to anonymous users
GRANT EXECUTE ON FUNCTION public.check_user_status(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_user_status(text) TO authenticated;