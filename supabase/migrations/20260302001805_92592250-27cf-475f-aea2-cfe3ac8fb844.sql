
CREATE TABLE public.dismissed_missile_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  alert_id uuid NOT NULL REFERENCES public.missile_alerts(id) ON DELETE CASCADE,
  dismissed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, alert_id)
);

ALTER TABLE public.dismissed_missile_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own dismissed alerts"
ON public.dismissed_missile_alerts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dismissed alerts"
ON public.dismissed_missile_alerts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dismissed alerts"
ON public.dismissed_missile_alerts FOR DELETE
USING (auth.uid() = user_id);
