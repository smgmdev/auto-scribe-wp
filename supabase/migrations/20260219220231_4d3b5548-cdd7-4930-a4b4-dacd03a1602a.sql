
CREATE OR REPLACE FUNCTION public.get_admin_online_status()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles r ON r.user_id = p.id
    WHERE r.role = 'admin'
      AND p.last_online_at IS NOT NULL
      AND p.last_online_at > now() - interval '2 minutes'
    LIMIT 1
  );
$$;
