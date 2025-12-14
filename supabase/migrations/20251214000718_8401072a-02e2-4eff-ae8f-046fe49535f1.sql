-- Add rejection_seen column to track when user has viewed their rejection
ALTER TABLE public.agency_applications 
ADD COLUMN rejection_seen BOOLEAN NOT NULL DEFAULT false;