-- Add about column for agencies/people entries
ALTER TABLE public.media_sites ADD COLUMN IF NOT EXISTS about TEXT;