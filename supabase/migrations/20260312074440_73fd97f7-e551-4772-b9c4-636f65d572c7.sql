
-- Fix: "Users can delete their agency logos" has no ownership check
-- Any authenticated user could delete ANY agency logo in the bucket
DROP POLICY IF EXISTS "Users can delete their agency logos" ON storage.objects;
CREATE POLICY "Users can delete their own agency logos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'agency-logos'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- Fix: "Users can update their agency logos" has no ownership check
DROP POLICY IF EXISTS "Users can update their agency logos" ON storage.objects;
CREATE POLICY "Users can update their own agency logos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'agency-logos'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
