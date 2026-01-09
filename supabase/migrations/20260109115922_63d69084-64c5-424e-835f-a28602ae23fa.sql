-- Add SEO fields to articles table
ALTER TABLE public.articles 
ADD COLUMN IF NOT EXISTS focus_keyword text,
ADD COLUMN IF NOT EXISTS meta_description text;