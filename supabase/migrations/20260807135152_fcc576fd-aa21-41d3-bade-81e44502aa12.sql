ALTER TABLE public.approvals DROP CONSTRAINT IF EXISTS approvals_acao_check;
ALTER TABLE public.approvals ADD CONSTRAINT approvals_acao_check CHECK (acao = ANY (ARRAY['APROVAR','REPROVAR','PEDIR_INFO','CANCELAR','COMENTARIO']));
ALTER TABLE public.approvals DROP CONSTRAINT IF EXISTS approvals_level_check;
ALTER TABLE public.approvals ADD CONSTRAINT approvals_level_check CHECK (level = ANY (ARRAY['GESTOR_1','DIRETOR_2','SOLICITANTE']));