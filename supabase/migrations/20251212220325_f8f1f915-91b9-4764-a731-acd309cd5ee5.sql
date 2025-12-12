-- Create service_requests table for client briefs
CREATE TABLE public.service_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  media_site_id UUID NOT NULL REFERENCES public.media_sites(id) ON DELETE CASCADE,
  agency_payout_id UUID REFERENCES public.agency_payouts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create service_messages table for back-and-forth communication
CREATE TABLE public.service_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'agency', 'admin')),
  sender_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add order reference to service_requests (after client pays)
ALTER TABLE public.service_requests ADD COLUMN order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

-- Enable RLS on both tables
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for service_requests
-- Clients can view their own requests
CREATE POLICY "Users can view their own requests"
ON public.service_requests FOR SELECT
USING (auth.uid() = user_id);

-- Clients can create requests
CREATE POLICY "Users can create requests"
ON public.service_requests FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Clients can update their own pending requests
CREATE POLICY "Users can update their own requests"
ON public.service_requests FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can manage all requests
CREATE POLICY "Admins can manage all requests"
ON public.service_requests FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for service_messages
-- Users can view messages for their requests
CREATE POLICY "Users can view messages for their requests"
ON public.service_messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.service_requests sr 
    WHERE sr.id = request_id AND sr.user_id = auth.uid()
  )
);

-- Users can create messages for their requests
CREATE POLICY "Users can create messages for their requests"
ON public.service_messages FOR INSERT
WITH CHECK (
  sender_type = 'client' AND
  EXISTS (
    SELECT 1 FROM public.service_requests sr 
    WHERE sr.id = request_id AND sr.user_id = auth.uid()
  )
);

-- Admins can manage all messages
CREATE POLICY "Admins can manage all messages"
ON public.service_messages FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create updated_at trigger for service_requests
CREATE TRIGGER update_service_requests_updated_at
BEFORE UPDATE ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add agency login fields to agency_payouts if not exists
ALTER TABLE public.agency_payouts ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.agency_payouts ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;