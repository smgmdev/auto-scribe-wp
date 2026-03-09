
CREATE TABLE public.geopolitical_alpha_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  signals JSONB NOT NULL,
  market_summary TEXT NOT NULL,
  data_points JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.geopolitical_alpha_signals ENABLE ROW LEVEL SECURITY;

-- Users can only see their own signals
CREATE POLICY "Users can read own alpha signals"
  ON public.geopolitical_alpha_signals
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only service role inserts (via edge function)
CREATE POLICY "Service role inserts alpha signals"
  ON public.geopolitical_alpha_signals
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own signals
CREATE POLICY "Users can delete own alpha signals"
  ON public.geopolitical_alpha_signals
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
