
-- Create agency_sessions table for proper session management
CREATE TABLE public.agency_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agency_payouts(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agency_sessions ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) should access this table
-- No public policies needed - accessed via service role key in edge functions

-- Index for fast token lookups
CREATE INDEX idx_agency_sessions_token ON public.agency_sessions(token);

-- Index for cleanup of expired sessions
CREATE INDEX idx_agency_sessions_expires_at ON public.agency_sessions(expires_at);
