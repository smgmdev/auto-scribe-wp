-- Add dedicated date columns so each lifecycle event is independently tracked
ALTER TABLE public.agency_applications
  ADD COLUMN IF NOT EXISTS pre_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Backfill: for approved apps, pre_approved_at = reviewed_at
UPDATE public.agency_applications SET pre_approved_at = reviewed_at WHERE status = 'approved' AND reviewed_at IS NOT NULL;

-- Backfill: for rejected apps that have NO verification record (direct rejection), rejected_at = reviewed_at
UPDATE public.agency_applications SET rejected_at = reviewed_at WHERE status = 'rejected' AND reviewed_at IS NOT NULL;

-- Backfill: for cancelled apps, cancelled_at = updated_at (best available approximation)
UPDATE public.agency_applications SET cancelled_at = updated_at WHERE status = 'cancelled';