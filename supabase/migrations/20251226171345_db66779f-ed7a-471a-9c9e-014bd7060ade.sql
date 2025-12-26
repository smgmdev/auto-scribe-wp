-- Add delivery_deadline column to orders table
ALTER TABLE public.orders 
ADD COLUMN delivery_deadline timestamp with time zone;