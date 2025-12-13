-- Add missing columns to agency_applications table
ALTER TABLE public.agency_applications 
ADD COLUMN IF NOT EXISTS media_niches text[],
ADD COLUMN IF NOT EXISTS media_channels text;