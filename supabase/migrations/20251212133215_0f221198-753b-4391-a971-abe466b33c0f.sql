-- Add category column to media_sites for tab/subcategory organization
ALTER TABLE public.media_sites 
ADD COLUMN category TEXT NOT NULL DEFAULT 'Global',
ADD COLUMN subcategory TEXT;