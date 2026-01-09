-- Add cancelled_by column to service_requests to track who cancelled the engagement
ALTER TABLE public.service_requests 
ADD COLUMN IF NOT EXISTS cancelled_by text DEFAULT NULL;

-- Add a comment to describe the column
COMMENT ON COLUMN public.service_requests.cancelled_by IS 'Who cancelled the engagement: client, agency, or admin';