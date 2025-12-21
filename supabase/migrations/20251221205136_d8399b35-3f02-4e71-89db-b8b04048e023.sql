-- Allow authenticated users to view agency logos (files ending with logo pattern in agency-documents bucket)
CREATE POLICY "Authenticated users can view agency logos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'agency-documents' 
  AND auth.uid() IS NOT NULL
  AND name LIKE '%logo%'
);