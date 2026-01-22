-- Allow anyone to view agency logo files in agency-documents bucket
CREATE POLICY "Anyone can view agency logos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'agency-documents' AND (storage.filename(name) LIKE 'logo-%' OR name LIKE '%/logo-%'));