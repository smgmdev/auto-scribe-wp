-- Add policy to allow admins to insert credit transactions
CREATE POLICY "Admins can insert credit transactions" 
ON public.credit_transactions 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));