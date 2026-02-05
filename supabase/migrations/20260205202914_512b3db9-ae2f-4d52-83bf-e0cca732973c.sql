-- Add fields for focus keyword, tags, image URL, and image caption
ALTER TABLE public.ai_published_sources 
ADD COLUMN focus_keyword TEXT,
ADD COLUMN tags TEXT[],
ADD COLUMN image_url TEXT,
ADD COLUMN image_caption TEXT;