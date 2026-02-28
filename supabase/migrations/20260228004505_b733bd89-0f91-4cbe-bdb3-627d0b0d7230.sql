
-- Lightweight lock table to prevent concurrent publishing from same RSS source
CREATE TABLE public.auto_publish_locks (
  source_url TEXT PRIMARY KEY,
  locked_by UUID NOT NULL,
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Auto-cleanup stale locks older than 10 minutes
CREATE OR REPLACE FUNCTION public.cleanup_stale_publish_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.auto_publish_locks
  WHERE locked_at < now() - interval '10 minutes';
  RETURN NEW;
END;
$$;

CREATE TRIGGER cleanup_stale_locks
BEFORE INSERT ON public.auto_publish_locks
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_stale_publish_locks();

-- RLS: no direct client access, only service role
ALTER TABLE public.auto_publish_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to publish locks"
ON public.auto_publish_locks
FOR ALL
USING (false)
WITH CHECK (false);
