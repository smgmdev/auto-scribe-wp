-- Create threat_forecasts table to store user-specific forecast history
CREATE TABLE public.threat_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  forecast jsonb NOT NULL,
  data_points jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.threat_forecasts ENABLE ROW LEVEL SECURITY;

-- Users can view their own forecasts
CREATE POLICY "Users can view their own forecasts"
ON public.threat_forecasts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own forecasts
CREATE POLICY "Users can insert their own forecasts"
ON public.threat_forecasts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own forecasts
CREATE POLICY "Users can delete their own forecasts"
ON public.threat_forecasts
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Admins can manage all forecasts
CREATE POLICY "Admins can manage all forecasts"
ON public.threat_forecasts
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Index for faster user lookups
CREATE INDEX idx_threat_forecasts_user_id ON public.threat_forecasts(user_id);
CREATE INDEX idx_threat_forecasts_created_at ON public.threat_forecasts(created_at DESC);