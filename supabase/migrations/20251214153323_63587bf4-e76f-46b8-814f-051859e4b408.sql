-- Create table for custom payout verifications
CREATE TABLE public.agency_custom_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agency_payout_id UUID REFERENCES public.agency_payouts(id) ON DELETE CASCADE,
  
  -- Personal/Company Info
  full_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  country TEXT NOT NULL,
  phone TEXT,
  
  -- Document uploads (stored in storage bucket)
  company_documents_url TEXT,
  passport_url TEXT,
  additional_documents_url TEXT,
  
  -- Bank Account Details
  bank_account_holder TEXT,
  bank_account_number TEXT,
  bank_name TEXT,
  bank_swift_code TEXT,
  bank_iban TEXT,
  bank_country TEXT,
  
  -- Crypto Payout Details
  usdt_wallet_address TEXT,
  usdt_network TEXT, -- TRC20, ERC20, etc.
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending_review',
  admin_notes TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agency_custom_verifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own custom verifications"
ON public.agency_custom_verifications
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own custom verifications"
ON public.agency_custom_verifications
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending custom verifications"
ON public.agency_custom_verifications
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending_review');

CREATE POLICY "Admins can manage all custom verifications"
ON public.agency_custom_verifications
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add payout_method to agency_payouts to track payment type
ALTER TABLE public.agency_payouts 
ADD COLUMN IF NOT EXISTS payout_method TEXT DEFAULT 'stripe';

-- Create trigger for updated_at
CREATE TRIGGER update_agency_custom_verifications_updated_at
BEFORE UPDATE ON public.agency_custom_verifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for custom verification documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('agency-kyc-documents', 'agency-kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for agency KYC documents
CREATE POLICY "Users can upload their own KYC documents"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'agency-kyc-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own KYC documents"
ON storage.objects
FOR SELECT
USING (bucket_id = 'agency-kyc-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can view all KYC documents"
ON storage.objects
FOR SELECT
USING (bucket_id = 'agency-kyc-documents' AND has_role(auth.uid(), 'admin'::app_role));