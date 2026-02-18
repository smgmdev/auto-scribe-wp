
-- Recreate get_published_articles to include featured_image
DROP FUNCTION IF EXISTS public.get_published_articles();

CREATE FUNCTION public.get_published_articles()
RETURNS TABLE(
  id uuid,
  title text,
  content text,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  tone text,
  tags text[],
  focus_keyword text,
  meta_description text,
  published_to text,
  published_to_favicon text,
  published_to_name text,
  wp_link text,
  featured_image json
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    title,
    content,
    created_at,
    updated_at,
    status,
    tone,
    tags,
    focus_keyword,
    meta_description,
    published_to,
    published_to_favicon,
    published_to_name,
    wp_link,
    featured_image::json
  FROM public.articles
  WHERE status = 'published'
    AND published_to IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 6;
$$;
