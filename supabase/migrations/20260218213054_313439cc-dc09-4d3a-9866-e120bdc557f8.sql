-- Fix: agency_sessions has RLS enabled but no policies
-- Agency sessions are created/read by the agency-auth edge function using service role.
-- No authenticated user should be able to read, insert, update, or delete sessions directly.
-- This effectively locks the table down for all client-side access.

CREATE POLICY "No direct client access to agency sessions"
ON public.agency_sessions
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);
