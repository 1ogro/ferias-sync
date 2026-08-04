DROP POLICY IF EXISTS "Users can update pending requests for corrections" ON public.requests;

CREATE POLICY "Users can update their own open requests"
ON public.requests
FOR UPDATE
TO authenticated
USING (
  requester_id IN (SELECT profiles.person_id FROM public.profiles WHERE profiles.user_id = auth.uid())
  AND status = ANY (ARRAY['PENDENTE','INFORMACOES_ADICIONAIS','EM_ANALISE_GESTOR','EM_ANALISE_DIRETOR'])
)
WITH CHECK (
  requester_id IN (SELECT profiles.person_id FROM public.profiles WHERE profiles.user_id = auth.uid())
);