
CREATE OR REPLACE FUNCTION public.get_latest_auto_published()
RETURNS TABLE(
  id uuid,
  ai_title text,
  source_title text,
  wordpress_site_name text,
  wordpress_site_favicon text,
  published_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    id,
    ai_title,
    source_title,
    wordpress_site_name,
    wordpress_site_favicon,
    published_at
  FROM public.ai_published_sources
  ORDER BY published_at DESC
  LIMIT 3;
$$;
