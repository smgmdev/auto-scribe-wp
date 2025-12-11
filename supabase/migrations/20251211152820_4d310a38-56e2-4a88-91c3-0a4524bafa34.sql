-- Add PIN column to profiles table (stored as hashed value)
ALTER TABLE public.profiles 
ADD COLUMN pin_hash text DEFAULT NULL,
ADD COLUMN pin_enabled boolean NOT NULL DEFAULT false;