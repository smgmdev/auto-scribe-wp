-- Add read field to agency_applications to track if admin has reviewed it
ALTER TABLE public.agency_applications 
ADD COLUMN read boolean NOT NULL DEFAULT false;