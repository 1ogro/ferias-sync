-- Allow directors to create requests on behalf of others (for historical requests)
DROP POLICY IF EXISTS "Users can create their own requests" ON public.requests;

-- Create updated policy that allows directors to create requests for anyone
CREATE POLICY "Users can create their own requests or directors can create for anyone" 
ON public.requests 
FOR INSERT 
WITH CHECK (
  -- Users can create their own requests
  (requester_id IN (
    SELECT profiles.person_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  )) 
  OR 
  -- Directors can create requests for anyone
  (EXISTS (
    SELECT 1 
    FROM profiles prof
    JOIN people per ON prof.person_id = per.id
    WHERE prof.user_id = auth.uid() 
    AND per.papel = 'DIRETOR'
  ))
);