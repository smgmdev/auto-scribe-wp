
-- FIX 5: agency_withdrawals - ensure RLS is enabled and user-scoped
ALTER TABLE public.agency_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own withdrawals" ON public.agency_withdrawals;
DROP POLICY IF EXISTS "Admins can manage withdrawals" ON public.agency_withdrawals;

CREATE POLICY "Users can view their own withdrawals"
ON public.agency_withdrawals FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage withdrawals"
ON public.agency_withdrawals FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- FIX 6: site_tags - restrict to authenticated users only (not public anon)
DROP POLICY IF EXISTS "Anyone can view site tags" ON public.site_tags;
DROP POLICY IF EXISTS "Authenticated users can view site tags" ON public.site_tags;

ALTER TABLE public.site_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view site tags"
ON public.site_tags FOR SELECT
USING (auth.role() = 'authenticated');
