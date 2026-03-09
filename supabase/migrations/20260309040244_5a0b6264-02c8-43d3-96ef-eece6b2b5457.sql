
CREATE TABLE public.conflict_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  country_a text NOT NULL,
  country_b text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  result jsonb,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

ALTER TABLE public.conflict_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all simulations"
  ON public.conflict_simulations FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own simulations"
  ON public.conflict_simulations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own simulations"
  ON public.conflict_simulations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
