
-- FIX 2: press_releases - create safe function stripping created_by
CREATE OR REPLACE FUNCTION public.get_published_press_releases()
RETURNS TABLE(
  id uuid,
  title text,
  content text,
  category text,
  image_url text,
  footer_contacts text[],
  published boolean,
  published_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, title, content, category, image_url, footer_contacts,
    published, published_at, created_at, updated_at
  FROM public.press_releases
  WHERE published = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_published_press_releases() TO anon;
GRANT EXECUTE ON FUNCTION public.get_published_press_releases() TO authenticated;

-- FIX 3: press_release_categories - strip created_by from public access
CREATE OR REPLACE FUNCTION public.get_press_release_categories()
RETURNS TABLE(id uuid, name text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name, created_at FROM public.press_release_categories;
$$;

GRANT EXECUTE ON FUNCTION public.get_press_release_categories() TO anon;
GRANT EXECUTE ON FUNCTION public.get_press_release_categories() TO authenticated;

-- FIX 4: credit_packs - hide stripe_price_id from public
CREATE OR REPLACE FUNCTION public.get_active_credit_packs()
RETURNS TABLE(id uuid, name text, credits integer, price_cents integer, active boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name, credits, price_cents, active, created_at
  FROM public.credit_packs WHERE active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_credit_packs() TO anon;
GRANT EXECUTE ON FUNCTION public.get_active_credit_packs() TO authenticated;
