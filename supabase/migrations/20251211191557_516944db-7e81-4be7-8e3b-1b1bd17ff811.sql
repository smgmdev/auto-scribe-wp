-- Add pin_salt column for secure PIN hashing
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_salt TEXT;