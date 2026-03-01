
-- Create missile_alerts table for real-time worldwide notifications
CREATE TABLE public.missile_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  country_code TEXT,
  country_name TEXT,
  source TEXT,
  severity TEXT NOT NULL DEFAULT 'critical',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.missile_alerts ENABLE ROW LEVEL SECURITY;

-- Everyone can read missile alerts (public safety)
CREATE POLICY "Anyone can read missile alerts"
  ON public.missile_alerts FOR SELECT
  USING (true);

-- Only admins can insert/update
CREATE POLICY "Admins can insert missile alerts"
  ON public.missile_alerts FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update missile alerts"
  ON public.missile_alerts FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.missile_alerts;
