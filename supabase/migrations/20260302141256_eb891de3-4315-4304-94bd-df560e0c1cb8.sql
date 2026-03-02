
-- Add published_at column to missile_alerts for accurate time-based filtering
ALTER TABLE public.missile_alerts
ADD COLUMN published_at timestamp with time zone DEFAULT now();

-- Backfill existing rows: set published_at = created_at
UPDATE public.missile_alerts SET published_at = created_at WHERE published_at IS NULL OR published_at = now();
