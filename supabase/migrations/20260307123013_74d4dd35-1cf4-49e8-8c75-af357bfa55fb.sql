
-- Generate a new verification token for the hotmail user
UPDATE public.profiles
SET verification_token = gen_random_uuid()::text,
    verification_token_expires_at = now() + interval '24 hours'
WHERE email = 'mutasimfatih@hotmail.com'
  AND email_verified = false;
