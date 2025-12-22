-- Allow users to delete their own cancelled service requests
CREATE POLICY "Users can delete their own cancelled requests"
ON public.service_requests
FOR DELETE
USING (auth.uid() = user_id AND status = 'cancelled');

-- Allow users to delete messages for their own requests (needed before deleting the request)
CREATE POLICY "Users can delete messages for their own requests"
ON public.service_messages
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM service_requests sr
  WHERE sr.id = service_messages.request_id AND sr.user_id = auth.uid()
));