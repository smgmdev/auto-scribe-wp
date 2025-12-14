-- Add columns to store site name and favicon directly on articles
-- This ensures article metadata persists even if the WordPress site is deleted

ALTER TABLE public.articles 
ADD COLUMN IF NOT EXISTS published_to_name text,
ADD COLUMN IF NOT EXISTS published_to_favicon text;