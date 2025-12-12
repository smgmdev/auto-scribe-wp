-- Create media_sites table for custom media outlets
CREATE TABLE public.media_sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  publication_format TEXT NOT NULL DEFAULT 'Article',
  google_index TEXT NOT NULL DEFAULT 'Regular',
  marks TEXT NOT NULL DEFAULT 'No',
  link TEXT NOT NULL,
  publishing_time TEXT NOT NULL DEFAULT '24h',
  max_words INTEGER,
  max_images INTEGER,
  price INTEGER NOT NULL DEFAULT 0,
  agency TEXT,
  favicon TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.media_sites ENABLE ROW LEVEL SECURITY;

-- Admin can manage media sites
CREATE POLICY "Admins can manage media sites"
ON public.media_sites
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone authenticated can view media sites
CREATE POLICY "Anyone can view media sites"
ON public.media_sites
FOR SELECT
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_media_sites_updated_at
BEFORE UPDATE ON public.media_sites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();