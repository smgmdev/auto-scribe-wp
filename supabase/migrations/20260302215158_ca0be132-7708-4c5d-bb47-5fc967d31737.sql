
CREATE TABLE public.precision_contact_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  organization_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.precision_contact_requests ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public contact form)
CREATE POLICY "Anyone can submit contact request"
ON public.precision_contact_requests
FOR INSERT
WITH CHECK (true);

-- Only admins can read
CREATE POLICY "Admins can read contact requests"
ON public.precision_contact_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can update
CREATE POLICY "Admins can update contact requests"
ON public.precision_contact_requests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
