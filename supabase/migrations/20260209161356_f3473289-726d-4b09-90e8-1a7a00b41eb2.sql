-- Change cascade delete to SET NULL so verification records are preserved when agency_payouts is deleted
ALTER TABLE public.agency_custom_verifications 
  DROP CONSTRAINT agency_custom_verifications_agency_payout_id_fkey;

ALTER TABLE public.agency_custom_verifications 
  ADD CONSTRAINT agency_custom_verifications_agency_payout_id_fkey 
  FOREIGN KEY (agency_payout_id) 
  REFERENCES public.agency_payouts(id) 
  ON DELETE SET NULL;