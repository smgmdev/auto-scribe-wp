-- Add footer contact columns to press_releases table
ALTER TABLE public.press_releases 
ADD COLUMN footer_contacts text[] DEFAULT '{}';

-- Add comment for clarity
COMMENT ON COLUMN public.press_releases.footer_contacts IS 'Array of footer contact types to display: press_contact, investor_relations';