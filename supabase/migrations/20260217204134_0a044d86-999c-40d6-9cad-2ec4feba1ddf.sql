
-- Create storage bucket for support ticket attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('support-attachments', 'support-attachments', false, 2097152)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Users can upload support attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'support-attachments');

-- Allow users to view support attachments for their own tickets, and admins can view all
CREATE POLICY "Users and admins can view support attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);
