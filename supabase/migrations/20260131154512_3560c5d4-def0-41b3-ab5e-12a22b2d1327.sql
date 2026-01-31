-- Create table for press release contacts
CREATE TABLE public.press_release_contacts (
  id text PRIMARY KEY,
  title text NOT NULL,
  name text NOT NULL,
  company text NOT NULL,
  email text NOT NULL,
  phone text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.press_release_contacts ENABLE ROW LEVEL SECURITY;

-- Anyone can view contacts (for public press release pages)
CREATE POLICY "Anyone can view press contacts"
ON public.press_release_contacts
FOR SELECT
USING (true);

-- Only admins can manage contacts
CREATE POLICY "Admins can manage press contacts"
ON public.press_release_contacts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default contacts
INSERT INTO public.press_release_contacts (id, title, name, company, email) VALUES
('press_contact', 'Press Contact', 'Press Team', 'Arcana Mace', 'press@arcanamace.com'),
('investor_relations', 'Investor Relations Contact', 'Investor Relations', 'Arcana Mace', 'ir@arcanamace.com');

-- Add updated_at trigger
CREATE TRIGGER update_press_release_contacts_updated_at
BEFORE UPDATE ON public.press_release_contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();