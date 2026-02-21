
CREATE OR REPLACE FUNCTION public.get_agency_info_by_payout_id(_payout_id uuid)
RETURNS TABLE(agency_name text, logo_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ap.agency_name,
    aa.logo_url
  FROM agency_payouts ap
  LEFT JOIN agency_applications aa 
    ON aa.agency_name = ap.agency_name 
    AND aa.status = 'approved'
  WHERE ap.id = _payout_id
  LIMIT 1;
$$;
