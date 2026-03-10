-- Create public bucket for podcast avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('podcast-avatars', 'podcast-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admins to upload
CREATE POLICY "Admins can upload podcast avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'podcast-avatars'
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to update
CREATE POLICY "Admins can update podcast avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'podcast-avatars'
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to delete
CREATE POLICY "Admins can delete podcast avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'podcast-avatars'
  AND public.has_role(auth.uid(), 'admin')
);

-- Public read access
CREATE POLICY "Anyone can view podcast avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'podcast-avatars');