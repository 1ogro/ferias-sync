-- Allow directors/admins to insert into pending_people
CREATE POLICY "Diretores podem criar cadastros pendentes"
ON public.pending_people
FOR INSERT
TO public
WITH CHECK (
  (created_by IN (
    SELECT profiles.person_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  ))
  AND
  EXISTS (
    SELECT 1
    FROM profiles prof
    JOIN people per ON prof.person_id = per.id
    WHERE prof.user_id = auth.uid()
    AND (per.papel IN ('DIRETOR', 'ADMIN') OR per.is_admin = true)
  )
);