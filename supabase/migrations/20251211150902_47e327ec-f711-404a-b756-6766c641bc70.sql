-- Create table for site tags
CREATE TABLE public.site_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#22c55e',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_tags ENABLE ROW LEVEL SECURITY;

-- Admins can manage site tags
CREATE POLICY "Admins can manage site tags"
ON public.site_tags
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can view site tags
CREATE POLICY "Anyone can view site tags"
ON public.site_tags
FOR SELECT
USING (true);