-- Update the get_public_sites function to only return connected sites
CREATE OR REPLACE FUNCTION public.get_public_sites()
 RETURNS TABLE(id uuid, name text, url text, seo_plugin text, favicon text, connected boolean)
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
    connected
  FROM public.wordpress_sites
  WHERE connected = true
  ORDER BY created_at ASC
$function$;