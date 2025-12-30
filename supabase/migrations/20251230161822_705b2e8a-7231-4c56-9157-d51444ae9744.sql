-- Add cancelled_at column to track when a request was cancelled
ALTER TABLE public.service_requests 
ADD COLUMN cancelled_at timestamp with time zone DEFAULT NULL;

-- Update existing cancelled requests to use updated_at as cancelled_at
-- (This is a best-effort approximation for existing data)
UPDATE public.service_requests 
SET cancelled_at = updated_at 
WHERE status = 'cancelled' AND cancelled_at IS NULL;