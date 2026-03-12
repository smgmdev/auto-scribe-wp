
-- Add admin-only RLS policies for nuke_codes table
-- so admins can manage codes from the terminal

CREATE POLICY "Admins can select nuke codes"
  ON public.nuke_codes
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert nuke codes"
  ON public.nuke_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update nuke codes"
  ON public.nuke_codes
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete nuke codes"
  ON public.nuke_codes
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
