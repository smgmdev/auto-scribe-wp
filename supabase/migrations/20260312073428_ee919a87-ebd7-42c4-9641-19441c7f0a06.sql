
CREATE TABLE public.nuke_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

ALTER TABLE public.nuke_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage nuke codes"
  ON public.nuke_codes
  FOR ALL
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can read and update nuke codes"
  ON public.nuke_codes
  FOR SELECT
  TO public
  USING (true);
