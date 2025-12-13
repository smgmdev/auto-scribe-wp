-- Add logo_url column to agency_applications table
ALTER TABLE public.agency_applications 
ADD COLUMN logo_url text;