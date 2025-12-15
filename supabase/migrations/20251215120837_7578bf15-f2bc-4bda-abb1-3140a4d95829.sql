-- Create table for agency WordPress site submissions pending approval
CREATE TABLE public.wordpress_site_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  username text NOT NULL,
  app_password text NOT NULL,
  seo_plugin text NOT NULL DEFAULT 'aioseo',
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wordpress_site_submissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own submissions
CREATE POLICY "Users can view their own WordPress submissions"
ON public.wordpress_site_submissions
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own submissions
CREATE POLICY "Users can insert their own WordPress submissions"
ON public.wordpress_site_submissions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their pending submissions
CREATE POLICY "Users can update their pending WordPress submissions"
ON public.wordpress_site_submissions
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending');

-- Admins can manage all submissions
CREATE POLICY "Admins can manage all WordPress submissions"
ON public.wordpress_site_submissions
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_wordpress_site_submissions_updated_at
BEFORE UPDATE ON public.wordpress_site_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();