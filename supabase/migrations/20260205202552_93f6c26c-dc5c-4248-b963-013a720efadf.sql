-- Add column to store the AI-generated title
ALTER TABLE public.ai_published_sources 
ADD COLUMN ai_title TEXT;