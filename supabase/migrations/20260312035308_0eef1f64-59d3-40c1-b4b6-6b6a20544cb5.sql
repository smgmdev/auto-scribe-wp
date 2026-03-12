
CREATE TABLE public.sipri_arms_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_name text NOT NULL,
  country_code text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('import', 'export')),
  partner_country text NOT NULL,
  weapon_designation text,
  weapon_category text,
  weapon_description text,
  order_date text,
  delivery_years text,
  quantity text,
  status text,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  data_year_from integer NOT NULL,
  data_year_to integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_sipri_country_code ON public.sipri_arms_transfers (country_code);
CREATE INDEX idx_sipri_country_direction ON public.sipri_arms_transfers (country_code, direction);

ALTER TABLE public.sipri_arms_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read SIPRI data"
  ON public.sipri_arms_transfers
  FOR SELECT
  TO authenticated
  USING (true);
