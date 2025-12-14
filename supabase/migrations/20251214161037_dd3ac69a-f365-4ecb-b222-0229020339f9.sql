-- Add company_address and bank_address columns to agency_custom_verifications table
ALTER TABLE public.agency_custom_verifications
ADD COLUMN company_address text,
ADD COLUMN bank_address text;