-- Add meta_description column to ai_published_sources table
ALTER TABLE public.ai_published_sources 
ADD COLUMN IF NOT EXISTS meta_description TEXT;