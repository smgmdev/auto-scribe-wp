
CREATE TABLE public.bug_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  reporter_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  steps_to_reproduce TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can insert bug reports (even unauthenticated)
CREATE POLICY "Anyone can submit bug reports"
  ON public.bug_reports FOR INSERT
  WITH CHECK (true);

-- Only admins can view all bug reports
CREATE POLICY "Admins can view all bug reports"
  ON public.bug_reports FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own bug reports
CREATE POLICY "Users can view own bug reports"
  ON public.bug_reports FOR SELECT
  USING (auth.uid() = user_id);

-- Only admins can update bug reports
CREATE POLICY "Admins can update bug reports"
  ON public.bug_reports FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));
