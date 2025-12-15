-- Add downgraded column to agency_payouts table
ALTER TABLE public.agency_payouts ADD COLUMN IF NOT EXISTS downgraded boolean NOT NULL DEFAULT false;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_agency_payouts_downgraded ON public.agency_payouts(downgraded);