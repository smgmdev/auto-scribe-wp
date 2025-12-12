-- Add country column to media_sites table for agencies/people
ALTER TABLE public.media_sites ADD COLUMN IF NOT EXISTS country text;