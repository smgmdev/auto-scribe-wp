-- Table to track signup attempts per IP for rate limiting
CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address text NOT NULL,
  email text NOT NULL,
  attempted_at timestamp with time zone NOT NULL DEFAULT now(),
  blocked boolean NOT NULL DEFAULT false
);

-- Index for fast IP-based lookups within a time window
CREATE INDEX idx_signup_attempts_ip_time ON public.signup_attempts (ip_address, attempted_at DESC);

-- Enable RLS - no direct client access at all
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to signup_attempts"
  ON public.signup_attempts
  FOR ALL
  USING (false)
  WITH CHECK (false);