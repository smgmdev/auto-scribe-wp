
CREATE OR REPLACE FUNCTION public.get_published_articles()
 RETURNS TABLE(id uuid, title text, content text, created_at timestamp with time zone, updated_at timestamp with time zone, status text, tone text, tags text[], focus_keyword text, meta_description text, published_to text, published_to_favicon text, published_to_name text, wp_link text, featured_image json)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ORDER BY random()
  LIMIT 12;
$function$;
