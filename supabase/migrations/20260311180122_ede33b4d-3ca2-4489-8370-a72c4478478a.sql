-- Fix: Restrict lost_chat_global_state UPDATE to admins only
DROP POLICY IF EXISTS "Anyone can update global state" ON public.lost_chat_global_state;

CREATE POLICY "Only admins can update global state"
ON public.lost_chat_global_state
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));