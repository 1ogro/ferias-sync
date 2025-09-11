-- Etapa 1: Adicionar coluna is_admin e preparar para segregação de papéis

-- Adicionar a nova coluna is_admin
ALTER TABLE public.people 
ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Atualizar dados existentes: usuários ADMIN viram is_admin=true
UPDATE public.people 
SET is_admin = true
WHERE papel = 'ADMIN';

-- Criar função auxiliar para verificar se usuário é admin (usando nova estrutura)
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM profiles p
    JOIN people per ON p.person_id = per.id
    WHERE p.user_id = auth.uid() 
    AND per.is_admin = true
  );
END;
$$;

-- Atualizar política de audit_logs para usar função is_admin
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view all audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (is_current_user_admin());

-- Comentário explicativo sobre a nova estrutura
COMMENT ON COLUMN public.people.is_admin IS 'Indica se o usuário tem permissões administrativas no sistema (independente do papel organizacional).';

-- Por enquanto, usuários ADMIN ainda mantêm papel='ADMIN' para compatibilidade
-- A conversão para o novo enum será feita em migração posterior