-- Add column to preserve target WordPress site ID for deletion capability
ALTER TABLE ai_published_sources
ADD COLUMN IF NOT EXISTS wordpress_site_id uuid;