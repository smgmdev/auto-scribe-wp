-- Add payout_method column to agency_applications
ALTER TABLE public.agency_applications 
ADD COLUMN payout_method text;