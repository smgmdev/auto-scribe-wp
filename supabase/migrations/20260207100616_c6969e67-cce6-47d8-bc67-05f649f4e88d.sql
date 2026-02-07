-- Add country column to agency_payouts table
ALTER TABLE public.agency_payouts 
ADD COLUMN country text;

-- Backfill existing records with country data from agency_applications
UPDATE public.agency_payouts ap
SET country = aa.country
FROM public.agency_applications aa
WHERE ap.agency_name = aa.agency_name
AND ap.country IS NULL
AND aa.country IS NOT NULL;