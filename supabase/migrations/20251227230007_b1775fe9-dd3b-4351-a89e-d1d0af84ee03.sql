-- Add UPDATE policy for minimized_chats table
CREATE POLICY "Users can update their own minimized chats" 
ON public.minimized_chats 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);