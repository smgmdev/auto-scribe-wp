-- Add separate read tracking for client and agency
-- Currently there's only one 'read' field which gets shared, causing notification bugs

-- Add new columns for separate read tracking
ALTER TABLE public.service_requests 
ADD COLUMN client_read BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN agency_read BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing data: copy current read status to both columns
UPDATE public.service_requests 
SET client_read = read, agency_read = read;

-- Note: We'll keep the old 'read' column for now for backward compatibility
-- and gradually migrate the code to use client_read and agency_read