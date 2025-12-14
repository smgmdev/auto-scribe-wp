-- Add new columns to agency_custom_verifications table
ALTER TABLE public.agency_custom_verifications
ADD COLUMN first_name text,
ADD COLUMN last_name text,
ADD COLUMN email text,
ADD COLUMN company_id text,
ADD COLUMN tax_number text;

-- Migrate existing full_name data to first_name (keep full_name for backwards compatibility)
UPDATE public.agency_custom_verifications 
SET first_name = full_name 
WHERE first_name IS NULL AND full_name IS NOT NULL;