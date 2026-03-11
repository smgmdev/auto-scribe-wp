
CREATE TABLE public.marketing_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  source_sheet_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT marketing_emails_email_unique UNIQUE (email)
);

ALTER TABLE public.marketing_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage marketing emails"
  ON public.marketing_emails
  FOR ALL
  TO public
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
