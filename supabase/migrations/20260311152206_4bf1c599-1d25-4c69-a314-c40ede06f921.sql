
CREATE TABLE public.marketing_send_control (
  id text PRIMARY KEY DEFAULT 'global',
  paused boolean NOT NULL DEFAULT false,
  paused_at timestamptz,
  paused_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert the single control row
INSERT INTO public.marketing_send_control (id, paused) VALUES ('global', false);

-- Only admins can read/write
ALTER TABLE public.marketing_send_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read send control"
  ON public.marketing_send_control FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update send control"
  ON public.marketing_send_control FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
