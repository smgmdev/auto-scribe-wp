-- Add price and logo_url columns to wordpress_site_submissions table
ALTER TABLE public.wordpress_site_submissions
ADD COLUMN IF NOT EXISTS price integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS logo_url text DEFAULT NULL;