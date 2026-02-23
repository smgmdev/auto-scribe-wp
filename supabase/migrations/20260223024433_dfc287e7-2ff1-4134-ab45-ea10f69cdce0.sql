
-- Global state for 404 page model selection (single row)
CREATE TABLE public.lost_chat_global_state (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  active_model_id TEXT NOT NULL DEFAULT 'anime_girl',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

INSERT INTO public.lost_chat_global_state (id, active_model_id) VALUES ('singleton', 'anime_girl');

ALTER TABLE public.lost_chat_global_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read global state" ON public.lost_chat_global_state FOR SELECT USING (true);
CREATE POLICY "Anyone can update global state" ON public.lost_chat_global_state FOR UPDATE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.lost_chat_global_state;
