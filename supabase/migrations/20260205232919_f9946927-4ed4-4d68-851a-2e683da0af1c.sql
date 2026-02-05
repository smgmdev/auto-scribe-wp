-- Add columns to preserve WP site info and source config name
ALTER TABLE ai_published_sources
ADD COLUMN IF NOT EXISTS wordpress_site_name text,
ADD COLUMN IF NOT EXISTS wordpress_site_favicon text,
ADD COLUMN IF NOT EXISTS source_config_name text;