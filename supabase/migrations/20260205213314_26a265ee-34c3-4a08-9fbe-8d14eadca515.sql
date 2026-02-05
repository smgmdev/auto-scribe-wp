-- Create a table for predefined AI sources that admins can configure
CREATE TABLE public.ai_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_sources ENABLE ROW LEVEL SECURITY;

-- Only admins can view, create, update, and delete AI sources
CREATE POLICY "Admins can view all AI sources" 
ON public.ai_sources 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create AI sources" 
ON public.ai_sources 
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update AI sources" 
ON public.ai_sources 
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete AI sources" 
ON public.ai_sources 
FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_ai_sources_updated_at
BEFORE UPDATE ON public.ai_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert Yahoo Finance as a default source
INSERT INTO public.ai_sources (name, url, description, created_by)
SELECT 'Yahoo Finance', 'https://finance.yahoo.com/', 'Real-time financial news and market updates', id
FROM auth.users
LIMIT 1;