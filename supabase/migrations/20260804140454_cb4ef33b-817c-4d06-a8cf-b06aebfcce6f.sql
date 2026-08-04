CREATE POLICY "Requesters can comment on their own requests"
ON public.approvals
FOR INSERT
TO authenticated
WITH CHECK (
  acao = 'COMENTARIO'
  AND level = 'SOLICITANTE'
  AND approver_id IN (SELECT person_id FROM public.profiles WHERE user_id = auth.uid())
  AND request_id IN (
    SELECT r.id FROM public.requests r
    WHERE r.requester_id IN (SELECT person_id FROM public.profiles WHERE user_id = auth.uid())
  )
);