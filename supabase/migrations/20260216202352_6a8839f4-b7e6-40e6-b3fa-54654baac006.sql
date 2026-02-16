
-- Make bug-attachments bucket private
UPDATE storage.buckets SET public = false WHERE id = 'bug-attachments';

-- Drop the public SELECT policy
DROP POLICY IF EXISTS "Anyone can view bug attachments" ON storage.objects;

-- Admins can view all bug attachments
CREATE POLICY "Admins can view bug attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'bug-attachments'
  AND public.has_role(auth.uid(), 'admin')
);

-- Bug report submitters can view their own attachments (file path starts with their user_id or matches their upload)
CREATE POLICY "Authenticated users can view bug attachments they uploaded"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'bug-attachments'
  AND auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.bug_reports br
    WHERE br.user_id = auth.uid()
    AND br.attachment_url LIKE '%' || storage.filename(name)
  )
);
