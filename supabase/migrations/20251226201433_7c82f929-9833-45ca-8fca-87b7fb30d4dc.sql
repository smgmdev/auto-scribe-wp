-- Allow admin_investigations.order_id to be nullable for engagements without orders
ALTER TABLE public.admin_investigations ALTER COLUMN order_id DROP NOT NULL;