-- Create admin investigations table to track when admins investigate orders
CREATE TABLE public.admin_investigations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID NOT NULL,
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  UNIQUE(service_request_id)
);

-- Enable RLS
ALTER TABLE public.admin_investigations ENABLE ROW LEVEL SECURITY;

-- Only admins can manage investigations
CREATE POLICY "Admins can manage investigations"
ON public.admin_investigations
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add index for faster lookups
CREATE INDEX idx_admin_investigations_status ON public.admin_investigations(status);
CREATE INDEX idx_admin_investigations_admin ON public.admin_investigations(admin_id);