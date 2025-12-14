-- Add read field to agency_custom_verifications
ALTER TABLE public.agency_custom_verifications 
ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false;