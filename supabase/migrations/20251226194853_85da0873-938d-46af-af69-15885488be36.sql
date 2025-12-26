-- Add last_online_at column to profiles table for tracking user presence
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_online_at timestamp with time zone;

-- Add last_online_at column to agency_payouts table for tracking agency presence
ALTER TABLE public.agency_payouts 
ADD COLUMN IF NOT EXISTS last_online_at timestamp with time zone;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_last_online_at ON public.profiles(last_online_at);
CREATE INDEX IF NOT EXISTS idx_agency_payouts_last_online_at ON public.agency_payouts(last_online_at);