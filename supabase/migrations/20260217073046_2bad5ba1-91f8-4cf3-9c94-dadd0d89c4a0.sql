
CREATE OR REPLACE FUNCTION public.get_public_agency_details(_agency_name text)
RETURNS TABLE (
  agency_name text,
  country text,
  logo_url text,
  agency_website text,
  agency_description text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ap.agency_name,
    COALESCE(aa.country, ap.country) as country,
    aa.logo_url,
    aa.agency_website,
    aa.agency_description,
    ap.created_at
  FROM public.agency_payouts ap
  LEFT JOIN public.agency_applications aa 
    ON aa.agency_name = ap.agency_name AND aa.status = 'approved'
  WHERE ap.agency_name = _agency_name
    AND ap.onboarding_complete = true
    AND ap.downgraded = false
  LIMIT 1;
$$;
