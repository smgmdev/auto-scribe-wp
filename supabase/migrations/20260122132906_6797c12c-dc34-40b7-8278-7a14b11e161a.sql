-- Allow anyone to view approved agency applications (for public landing page)
CREATE POLICY "Anyone can view approved applications"
ON public.agency_applications
FOR SELECT
USING (status = 'approved');