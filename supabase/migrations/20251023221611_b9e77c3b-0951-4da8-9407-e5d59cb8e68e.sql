-- Atualizar a policy de DELETE para permitir colaboradores excluírem suas próprias solicitações não-aprovadas
DROP POLICY IF EXISTS "Users can delete their own draft requests" ON public.requests;

CREATE POLICY "Users can delete their own non-approved requests"
ON public.requests
FOR DELETE
USING (
  requester_id IN (
    SELECT person_id FROM profiles WHERE user_id = auth.uid()
  )
  AND status IN ('RASCUNHO', 'PENDENTE', 'INFORMACOES_ADICIONAIS', 'REJEITADO')
);