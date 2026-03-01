
-- Table to store surveillance scan results
CREATE TABLE public.surveillance_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scanned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  global_tension_score INTEGER NOT NULL DEFAULT 0,
  global_tension_level TEXT NOT NULL DEFAULT 'low',
  country_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'perplexity',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.surveillance_scans ENABLE ROW LEVEL SECURITY;

-- Only admins can read
CREATE POLICY "Admins can read surveillance scans"
ON public.surveillance_scans
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Only service role inserts (edge functions)
-- No insert policy for regular users
