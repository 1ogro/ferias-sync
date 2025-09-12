-- Allow unauthenticated users to view basic information of active people for signup
CREATE POLICY "Public can view active people for signup" 
ON public.people 
FOR SELECT 
TO anon
USING (ativo = true);