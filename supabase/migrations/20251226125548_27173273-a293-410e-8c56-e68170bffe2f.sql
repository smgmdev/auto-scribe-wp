-- Create the function with the agency field
CREATE FUNCTION public.get_public_sites()
 RETURNS TABLE(id uuid, name text, url text, seo_plugin text, favicon text, connected boolean, agency text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    id,
    name,
    url,
    seo_plugin,
    favicon,
    connected,
    agency
  FROM public.wordpress_sites
  WHERE connected = true
  ORDER BY created_at ASC
$function$;