
-- Store Mace AI default categories per WP site (with and without featured image)
CREATE TABLE public.mace_site_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES public.wordpress_sites(id) ON DELETE CASCADE,
  category_id integer NOT NULL,
  category_name text NOT NULL,
  has_image boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(site_id, category_id, has_image)
);

ALTER TABLE public.mace_site_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage mace site categories"
  ON public.mace_site_categories FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
