-- Add DELETE policy for users to delete their own draft requests
CREATE POLICY "Users can delete their own draft requests"
ON public.requests FOR DELETE
USING (
  requester_id IN (SELECT profiles.person_id FROM profiles WHERE profiles.user_id = auth.uid())
  AND status = 'RASCUNHO'
);