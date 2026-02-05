-- Create table for AI publishing settings
CREATE TABLE public.ai_publishing_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  auto_publish BOOLEAN NOT NULL DEFAULT false,
  target_site_id UUID REFERENCES public.wordpress_sites(id) ON DELETE SET NULL,
  rewrite_enabled BOOLEAN NOT NULL DEFAULT true,
  fetch_images BOOLEAN NOT NULL DEFAULT true,
  publish_interval_minutes INTEGER NOT NULL DEFAULT 60,
  tone TEXT NOT NULL DEFAULT 'professional',
  last_fetched_at TIMESTAMP WITH TIME ZONE,
  last_published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.ai_publishing_settings ENABLE ROW LEVEL SECURITY;

-- Admin-only policies (using correct function signature: has_role(user_id, role))
CREATE POLICY "Only admins can view AI publishing settings"
ON public.ai_publishing_settings
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can create AI publishing settings"
ON public.ai_publishing_settings
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update AI publishing settings"
ON public.ai_publishing_settings
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete AI publishing settings"
ON public.ai_publishing_settings
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_ai_publishing_settings_updated_at
BEFORE UPDATE ON public.ai_publishing_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();