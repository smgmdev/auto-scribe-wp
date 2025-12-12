-- Add user_id column to agency_payouts to link agencies to their user accounts
ALTER TABLE public.agency_payouts 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX idx_agency_payouts_user_id ON public.agency_payouts(user_id);

-- Add RLS policy so users can view their own agency payout record
CREATE POLICY "Users can view their own agency payout" 
ON public.agency_payouts 
FOR SELECT 
USING (auth.uid() = user_id);