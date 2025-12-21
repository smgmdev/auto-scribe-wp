-- Allow authenticated users to view approved agency applications (for displaying in agencies list)
CREATE POLICY "Authenticated users can view approved applications"
ON public.agency_applications
FOR SELECT
USING (status = 'approved' AND auth.uid() IS NOT NULL);