
CREATE OR REPLACE FUNCTION public.get_counterparty_online_status(
  _request_id uuid
)
RETURNS TABLE(is_online boolean, last_online_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller_id uuid := auth.uid();
  _request RECORD;
  _two_min_ago timestamptz := now() - interval '2 minutes';
BEGIN
  -- Fetch the service request
  SELECT sr.user_id, sr.agency_payout_id
  INTO _request
  FROM public.service_requests sr
  WHERE sr.id = _request_id;

  IF _request IS NULL THEN
    RETURN QUERY SELECT false, NULL::timestamptz;
    RETURN;
  END IF;

  -- Check if caller is the client → return agency status
  IF _caller_id = _request.user_id AND _request.agency_payout_id IS NOT NULL THEN
    RETURN QUERY
      SELECT 
        (ap.last_online_at IS NOT NULL AND ap.last_online_at > _two_min_ago),
        ap.last_online_at
      FROM public.agency_payouts ap
      WHERE ap.id = _request.agency_payout_id;
    RETURN;
  END IF;

  -- Check if caller is the agency → return client status
  IF EXISTS (
    SELECT 1 FROM public.agency_payouts ap 
    WHERE ap.id = _request.agency_payout_id AND ap.user_id = _caller_id
  ) THEN
    RETURN QUERY
      SELECT 
        (p.active_session_id IS NOT NULL AND p.last_online_at IS NOT NULL AND p.last_online_at > _two_min_ago),
        p.last_online_at
      FROM public.profiles p
      WHERE p.id = _request.user_id;
    RETURN;
  END IF;

  -- Check if caller is admin
  IF public.has_role(_caller_id, 'admin') THEN
    RETURN QUERY
      SELECT 
        (p.active_session_id IS NOT NULL AND p.last_online_at IS NOT NULL AND p.last_online_at > _two_min_ago),
        p.last_online_at
      FROM public.profiles p
      WHERE p.id = _request.user_id;
    RETURN;
  END IF;

  -- Not authorized
  RETURN QUERY SELECT false, NULL::timestamptz;
END;
$function$;
