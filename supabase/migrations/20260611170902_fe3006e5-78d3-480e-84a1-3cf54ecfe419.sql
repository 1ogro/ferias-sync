
CREATE POLICY "Users can insert their own audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  actor_id IN (SELECT person_id FROM profiles WHERE user_id = auth.uid())
);
