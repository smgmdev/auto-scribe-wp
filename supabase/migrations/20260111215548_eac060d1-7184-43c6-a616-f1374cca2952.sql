-- Allow users to view disputes for orders they own (regardless of who opened the dispute)
CREATE POLICY "Users can view disputes for their orders" 
ON public.disputes 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.id = disputes.order_id
    AND o.user_id = auth.uid()
  )
);