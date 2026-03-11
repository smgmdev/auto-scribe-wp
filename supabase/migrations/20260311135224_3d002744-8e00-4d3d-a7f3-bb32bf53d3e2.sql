
CREATE TABLE public.marketing_email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL,
  email text NOT NULL,
  category text NOT NULL DEFAULT 'marketing_people',
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent',
  UNIQUE (campaign_id, email)
);

ALTER TABLE public.marketing_email_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage marketing sends"
  ON public.marketing_email_sends
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_marketing_sends_campaign ON public.marketing_email_sends(campaign_id);
CREATE INDEX idx_marketing_sends_email ON public.marketing_email_sends(email);
