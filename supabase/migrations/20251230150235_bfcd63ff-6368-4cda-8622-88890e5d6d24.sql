-- Fix service_messages RLS policies - admin policy should be PERMISSIVE not RESTRICTIVE
-- This allows admins to see all messages regardless of other policy conditions

-- Drop the existing restrictive admin policy
DROP POLICY IF EXISTS "Admins can manage all messages" ON public.service_messages;

-- Create a permissive admin policy that allows full access
CREATE POLICY "Admins can manage all messages"
ON public.service_messages
AS PERMISSIVE
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));