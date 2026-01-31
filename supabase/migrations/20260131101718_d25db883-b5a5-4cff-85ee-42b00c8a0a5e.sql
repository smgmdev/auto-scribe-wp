-- Create press_release_categories table
CREATE TABLE public.press_release_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.press_release_categories ENABLE ROW LEVEL SECURITY;

-- Admins can manage categories
CREATE POLICY "Admins can manage all categories"
ON public.press_release_categories
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can view categories
CREATE POLICY "Anyone can view categories"
ON public.press_release_categories
FOR SELECT
USING (true);

-- Insert default categories
INSERT INTO public.press_release_categories (name, created_by)
SELECT name, (SELECT id FROM auth.users LIMIT 1)
FROM unnest(ARRAY['Press Release', 'Update', 'Announcement', 'Company News', 'Product']) AS name
ON CONFLICT (name) DO NOTHING;