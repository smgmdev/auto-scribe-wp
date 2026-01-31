-- Create press_releases table
CREATE TABLE public.press_releases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Press Release',
  image_url TEXT,
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.press_releases ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage all press releases" 
ON public.press_releases 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view published press releases" 
ON public.press_releases 
FOR SELECT 
USING (published = true);

-- Create storage bucket for press release images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('press-release-images', 'press-release-images', true);

-- Storage policies for press release images
CREATE POLICY "Admins can upload press release images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'press-release-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update press release images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'press-release-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete press release images"
ON storage.objects FOR DELETE
USING (bucket_id = 'press-release-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view press release images"
ON storage.objects FOR SELECT
USING (bucket_id = 'press-release-images');

-- Create trigger for updated_at
CREATE TRIGGER update_press_releases_updated_at
BEFORE UPDATE ON public.press_releases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();