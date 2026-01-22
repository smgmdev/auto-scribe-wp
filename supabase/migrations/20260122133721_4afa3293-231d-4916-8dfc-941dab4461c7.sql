-- Create a public bucket specifically for agency logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('agency-logos', 'agency-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow anyone to read from agency-logos bucket
CREATE POLICY "Anyone can view agency logos public"
ON storage.objects
FOR SELECT
USING (bucket_id = 'agency-logos');

-- Allow authenticated users to upload to agency-logos bucket
CREATE POLICY "Authenticated users can upload agency logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'agency-logos');

-- Allow users to update their own logos
CREATE POLICY "Users can update their agency logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'agency-logos');

-- Allow users to delete their own logos
CREATE POLICY "Users can delete their agency logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'agency-logos');