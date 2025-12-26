-- Create disputes table to track order disputes
CREATE TABLE public.disputes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reason TEXT,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  read BOOLEAN NOT NULL DEFAULT false
);

-- Enable RLS
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own disputes
CREATE POLICY "Users can view their own disputes"
ON public.disputes
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can create their own disputes
CREATE POLICY "Users can create their own disputes"
ON public.disputes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can view all disputes
CREATE POLICY "Admins can view all disputes"
ON public.disputes
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Admins can update any dispute
CREATE POLICY "Admins can update any dispute"
ON public.disputes
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Create index for faster lookups
CREATE INDEX idx_disputes_status ON public.disputes(status);
CREATE INDEX idx_disputes_user_id ON public.disputes(user_id);
CREATE INDEX idx_disputes_service_request_id ON public.disputes(service_request_id);