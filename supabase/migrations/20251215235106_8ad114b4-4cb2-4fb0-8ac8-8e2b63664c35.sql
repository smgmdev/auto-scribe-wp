-- Create storage bucket for WordPress site logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('wordpress-site-logos', 'wordpress-site-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own logos
CREATE POLICY "Users can upload their own wp site logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'wordpress-site-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow public read access to logos
CREATE POLICY "Anyone can view wp site logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'wordpress-site-logos');

-- Allow users to delete their own logos
CREATE POLICY "Users can delete their own wp site logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'wordpress-site-logos' AND auth.uid()::text = (storage.foldername(name))[1]);