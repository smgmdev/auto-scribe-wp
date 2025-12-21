-- Add read column to service_requests to track if agency has read the request
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false;