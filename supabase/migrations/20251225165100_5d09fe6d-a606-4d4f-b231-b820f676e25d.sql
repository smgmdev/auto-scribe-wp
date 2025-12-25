-- Add agency_description and wp_blog_url columns to agency_applications
ALTER TABLE public.agency_applications 
ADD COLUMN IF NOT EXISTS agency_description text,
ADD COLUMN IF NOT EXISTS wp_blog_url text;