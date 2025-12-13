-- Add email verification fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_token text,
ADD COLUMN IF NOT EXISTS verification_token_expires_at timestamp with time zone;