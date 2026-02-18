
-- Create immutable admin audit log table
-- Records every sensitive admin action: credit changes, suspensions, deletions, role changes
CREATE TABLE public.admin_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid NOT NULL,
  action_type text NOT NULL,
  target_user_id uuid,
  details jsonb,
  performed_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs; nobody can write directly (only via service role)
CREATE POLICY "Admins can view audit log"
  ON public.admin_audit_log
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Block all client-side inserts, updates, deletes — only edge functions (service role) write to this
CREATE POLICY "No direct client writes to audit log"
  ON public.admin_audit_log
  FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No direct client updates to audit log"
  ON public.admin_audit_log
  FOR UPDATE
  USING (false);

CREATE POLICY "No direct client deletes to audit log"
  ON public.admin_audit_log
  FOR DELETE
  USING (false);
