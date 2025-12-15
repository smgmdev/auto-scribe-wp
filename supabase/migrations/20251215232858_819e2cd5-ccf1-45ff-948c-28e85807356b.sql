-- Add read field to wordpress_sites to track when agencies have seen newly approved sites
ALTER TABLE public.wordpress_sites 
ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false;

-- Update existing sites to be marked as read
UPDATE public.wordpress_sites SET read = true WHERE read = false;