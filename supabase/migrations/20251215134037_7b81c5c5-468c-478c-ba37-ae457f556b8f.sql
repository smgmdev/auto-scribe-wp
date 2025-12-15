-- Add read column to wordpress_site_submissions
ALTER TABLE public.wordpress_site_submissions
ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false;

-- Add read column to media_site_submissions
ALTER TABLE public.media_site_submissions
ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false;