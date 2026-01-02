-- Add admin_read column to disputes table for separate admin notification tracking
ALTER TABLE public.disputes ADD COLUMN admin_read boolean NOT NULL DEFAULT false;