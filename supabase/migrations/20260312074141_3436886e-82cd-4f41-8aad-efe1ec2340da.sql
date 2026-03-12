
-- Drop the overly permissive SELECT policy that allows ANY user to read nuke codes
DROP POLICY IF EXISTS "Service role can read and update nuke codes" ON public.nuke_codes;

-- Create a table to log nuke code attempts for security auditing
CREATE TABLE IF NOT EXISTS public.nuke_code_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id bigint NOT NULL,
  user_id uuid,
  attempted_code text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.nuke_code_attempts ENABLE ROW LEVEL SECURITY;

-- Only admins can view attempts
CREATE POLICY "Admins can view nuke code attempts"
  ON public.nuke_code_attempts
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No direct insert from client — only service role (edge functions)
