-- Add hidden column to agency_applications table
ALTER TABLE public.agency_applications 
ADD COLUMN hidden boolean NOT NULL DEFAULT false;

-- Create index for faster filtering
CREATE INDEX idx_agency_applications_hidden ON public.agency_applications(hidden);