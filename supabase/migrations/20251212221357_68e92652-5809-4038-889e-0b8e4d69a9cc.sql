-- Create storage bucket for agency documents
INSERT INTO storage.buckets (id, name, public) VALUES ('agency-documents', 'agency-documents', false);

-- Create RLS policies for agency documents bucket
CREATE POLICY "Users can upload their own agency documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'agency-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own agency documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'agency-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can view all agency documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'agency-documents' AND has_role(auth.uid(), 'admin'::app_role));

-- Create agency applications table
CREATE TABLE public.agency_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp_phone TEXT NOT NULL,
  agency_name TEXT NOT NULL,
  country TEXT NOT NULL,
  agency_website TEXT NOT NULL,
  incorporation_document_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.agency_applications ENABLE ROW LEVEL SECURITY;

-- Users can view their own applications
CREATE POLICY "Users can view their own applications"
ON public.agency_applications FOR SELECT
USING (auth.uid() = user_id);

-- Users can create applications
CREATE POLICY "Users can create applications"
ON public.agency_applications FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can manage all applications
CREATE POLICY "Admins can manage all applications"
ON public.agency_applications FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_agency_applications_updated_at
BEFORE UPDATE ON public.agency_applications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();