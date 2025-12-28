-- Add last_read_at timestamps for accurate unread message counting
ALTER TABLE public.service_requests 
ADD COLUMN client_last_read_at timestamp with time zone,
ADD COLUMN agency_last_read_at timestamp with time zone;

-- Initialize existing records: set last_read_at to now() if already read, otherwise null
UPDATE public.service_requests 
SET client_last_read_at = CASE WHEN client_read = true THEN now() ELSE NULL END,
    agency_last_read_at = CASE WHEN agency_read = true THEN now() ELSE NULL END;