-- Add word_count column to ai_published_sources
ALTER TABLE public.ai_published_sources
ADD COLUMN word_count integer DEFAULT NULL;