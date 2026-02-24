-- Fix: Allow anonymous users to view site credits (prices are public info)
DROP POLICY "Anyone can view site credits" ON public.site_credits;
CREATE POLICY "Anyone can view site credits" ON public.site_credits
  FOR SELECT USING (true);