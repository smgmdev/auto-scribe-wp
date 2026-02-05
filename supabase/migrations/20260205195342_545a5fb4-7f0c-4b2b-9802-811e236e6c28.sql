-- Create table to track published source URLs for deduplication
CREATE TABLE public.ai_published_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_id UUID NOT NULL REFERENCES public.ai_publishing_settings(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  wordpress_post_id INTEGER,
  wordpress_post_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicate source URLs per setting
CREATE UNIQUE INDEX idx_ai_published_sources_unique ON public.ai_published_sources(setting_id, source_url);

-- Create index for faster lookups
CREATE INDEX idx_ai_published_sources_setting ON public.ai_published_sources(setting_id);
CREATE INDEX idx_ai_published_sources_published_at ON public.ai_published_sources(published_at DESC);

-- Enable RLS
ALTER TABLE public.ai_published_sources ENABLE ROW LEVEL SECURITY;

-- Admin-only access policy
CREATE POLICY "Admins can manage ai_published_sources"
  ON public.ai_published_sources
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add comment
COMMENT ON TABLE public.ai_published_sources IS 'Tracks source URLs that have been auto-published to prevent duplicate content';

-- Enable pg_cron and pg_net extensions for scheduled functions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;