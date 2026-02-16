-- Fix: Require authentication for bug report submissions
DROP POLICY IF EXISTS "Anyone can submit bug reports" ON public.bug_reports;

CREATE POLICY "Authenticated users can submit bug reports"
  ON public.bug_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
