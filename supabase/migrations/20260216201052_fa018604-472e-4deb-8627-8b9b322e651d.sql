
-- Make chat-attachments bucket private
UPDATE storage.buckets SET public = false WHERE id = 'chat-attachments';

-- Drop the old public SELECT policy
DROP POLICY IF EXISTS "Anyone can view chat attachments" ON storage.objects;

-- Create participant-based SELECT policy: only chat participants + admins can view
CREATE POLICY "Chat participants can view attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-attachments'
    AND (
      -- Admins can view all attachments
      public.has_role(auth.uid(), 'admin')
      -- Client of the service request (folder name = request_id)
      OR EXISTS (
        SELECT 1 FROM public.service_requests sr
        WHERE sr.id::text = (storage.foldername(name))[1]
        AND sr.user_id = auth.uid()
      )
      -- Agency assigned to the service request
      OR EXISTS (
        SELECT 1 FROM public.service_requests sr
        JOIN public.agency_payouts ap ON sr.agency_payout_id = ap.id
        WHERE sr.id::text = (storage.foldername(name))[1]
        AND ap.user_id = auth.uid()
      )
    )
  );
