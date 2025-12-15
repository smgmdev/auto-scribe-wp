-- Add rejected_media column to store titles that weren't imported
ALTER TABLE public.media_site_submissions 
ADD COLUMN IF NOT EXISTS rejected_media jsonb DEFAULT NULL;