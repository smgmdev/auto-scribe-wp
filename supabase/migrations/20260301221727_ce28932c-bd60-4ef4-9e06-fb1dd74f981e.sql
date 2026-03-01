
ALTER TABLE public.missile_alerts
ADD COLUMN origin_country_code TEXT,
ADD COLUMN origin_country_name TEXT,
ADD COLUMN destination_country_code TEXT,
ADD COLUMN destination_country_name TEXT;
