-- Add cancellation_reason column to service_requests table
ALTER TABLE public.service_requests
ADD COLUMN cancellation_reason text;