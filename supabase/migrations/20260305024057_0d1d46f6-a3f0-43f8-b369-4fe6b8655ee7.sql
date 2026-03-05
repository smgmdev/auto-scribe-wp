
-- Create a security definer function to check if user has precision enabled
CREATE OR REPLACE FUNCTION public.is_precision_enabled(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT precision_enabled FROM public.profiles WHERE id = _user_id),
    false
  )
$$;

-- Drop the existing admin-only SELECT policy
DROP POLICY IF EXISTS "Admins can read surveillance scans" ON public.surveillance_scans;

-- Create new policy that allows both admins and precision-enabled users
CREATE POLICY "Admins and precision users can read surveillance scans"
ON public.surveillance_scans
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_precision_enabled(auth.uid())
);
