-- Create wordpress_sites table to store connected sites
CREATE TABLE public.wordpress_sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  username TEXT NOT NULL,
  app_password TEXT NOT NULL,
  seo_plugin TEXT NOT NULL DEFAULT 'aioseo',
  favicon TEXT,
  connected BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wordpress_sites ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view sites
CREATE POLICY "Authenticated users can view sites"
ON public.wordpress_sites
FOR SELECT
USING (auth.role() = 'authenticated');

-- Only admins can manage sites
CREATE POLICY "Admins can manage sites"
ON public.wordpress_sites
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_wordpress_sites_updated_at
BEFORE UPDATE ON public.wordpress_sites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();