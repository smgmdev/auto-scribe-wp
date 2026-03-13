
CREATE TABLE public.investor_contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile_number TEXT NOT NULL,
  investor_type TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.investor_contact_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public inserts on investor_contact_requests"
ON public.investor_contact_requests FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admin select investor_contact_requests"
ON public.investor_contact_requests FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin update investor_contact_requests"
ON public.investor_contact_requests FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
