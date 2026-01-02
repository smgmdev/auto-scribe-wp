-- Add agency_read column to orders table to track agency notification state
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS agency_read boolean NOT NULL DEFAULT false;

-- Update existing delivered orders to be marked as read
UPDATE public.orders SET agency_read = true WHERE delivery_status = 'delivered' OR delivery_status = 'accepted';