
-- Trigger: auto-clear session_started_at when active_session_id becomes null
CREATE OR REPLACE FUNCTION public.auto_clear_session_started_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.active_session_id IS NULL AND OLD.active_session_id IS NOT NULL THEN
    NEW.session_started_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_clear_session_started_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_clear_session_started_at();
