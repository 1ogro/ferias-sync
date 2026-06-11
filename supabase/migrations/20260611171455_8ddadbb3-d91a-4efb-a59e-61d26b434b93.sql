
-- 1) profiles INSERT: lock person_id to the people row matching the user's auth email
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
CREATE POLICY "Users can create their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND person_id IN (
    SELECT p.id FROM public.people p
    WHERE lower(p.email) = lower((auth.jwt() ->> 'email'))
      AND p.ativo = true
  )
);

-- 2) profiles UPDATE: prevent re-pointing person_id to escalate
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND person_id IN (
    SELECT p.id FROM public.people p
    WHERE lower(p.email) = lower((auth.jwt() ->> 'email'))
      AND p.ativo = true
  )
);

-- 3) pending_people DELETE for directors/admins
CREATE POLICY "Diretores podem excluir cadastros pendentes"
ON public.pending_people
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles prof
    JOIN people per ON prof.person_id = per.id
    WHERE prof.user_id = auth.uid()
      AND (per.papel IN ('DIRETOR','ADMIN') OR per.is_admin = true)
  )
);
