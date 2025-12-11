-- Create articles table with user ownership
CREATE TABLE public.articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tone TEXT NOT NULL DEFAULT 'neutral',
  status TEXT NOT NULL DEFAULT 'draft',
  source_headline JSONB,
  featured_image JSONB,
  published_to TEXT,
  wp_post_id INTEGER,
  wp_link TEXT,
  wp_featured_media_id INTEGER,
  categories INTEGER[],
  tag_ids INTEGER[],
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- Users can view their own articles
CREATE POLICY "Users can view their own articles"
ON public.articles
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own articles
CREATE POLICY "Users can create their own articles"
ON public.articles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own articles
CREATE POLICY "Users can update their own articles"
ON public.articles
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own articles
CREATE POLICY "Users can delete their own articles"
ON public.articles
FOR DELETE
USING (auth.uid() = user_id);

-- Admins can view all articles
CREATE POLICY "Admins can view all articles"
ON public.articles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage all articles
CREATE POLICY "Admins can manage all articles"
ON public.articles
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_articles_updated_at
BEFORE UPDATE ON public.articles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for articles
ALTER PUBLICATION supabase_realtime ADD TABLE public.articles;