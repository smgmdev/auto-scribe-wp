-- Create agency withdrawals table
CREATE TABLE public.agency_withdrawals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agency_payout_id UUID REFERENCES public.agency_payouts(id),
  amount_cents INTEGER NOT NULL,
  withdrawal_method TEXT NOT NULL CHECK (withdrawal_method IN ('bank', 'crypto')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  bank_details JSONB,
  crypto_details JSONB,
  admin_notes TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID
);

-- Enable RLS
ALTER TABLE public.agency_withdrawals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage all withdrawals"
ON public.agency_withdrawals
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create their own withdrawals"
ON public.agency_withdrawals
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own withdrawals"
ON public.agency_withdrawals
FOR SELECT
USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_agency_withdrawals_user_id ON public.agency_withdrawals(user_id);
CREATE INDEX idx_agency_withdrawals_status ON public.agency_withdrawals(status);
CREATE INDEX idx_agency_withdrawals_created_at ON public.agency_withdrawals(created_at DESC);