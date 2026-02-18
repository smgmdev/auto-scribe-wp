
-- FIX 1: articles - Remove public policy that exposes user_id, wp metadata
DROP POLICY IF EXISTS "Anyone can view published articles" ON public.articles;

-- Create secure function exposing only safe columns for public articles
CREATE OR REPLACE FUNCTION public.get_published_articles()
RETURNS TABLE(
  id uuid,
  title text,
  content text,
  tone text,
  status text,
  published_to text,
  published_to_name text,
  published_to_favicon text,
  wp_link text,
  tags text[],
  focus_keyword text,
  meta_description text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, title, content, tone, status, published_to, published_to_name,
    published_to_favicon, wp_link, tags, focus_keyword, meta_description,
    created_at, updated_at
  FROM public.articles
  WHERE status = 'published';
$$;

GRANT EXECUTE ON FUNCTION public.get_published_articles() TO anon;
GRANT EXECUTE ON FUNCTION public.get_published_articles() TO authenticated;
