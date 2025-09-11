-- Segregar papéis organizacionais de permissões administrativas (versão corrigida v3)

-- Primeiro, vamos adicionar a nova coluna is_admin
ALTER TABLE public.people 
ADD COLUMN is_admin boolean DEFAULT false;

-- Criar enum para papéis organizacionais (sem ADMIN)
CREATE TYPE public.organizational_role_type AS ENUM (
  'COLABORADOR',
  'GESTOR', 
  'DIRETOR'
);

-- Dropar TODAS as políticas que dependem da coluna papel/organizational_role
DROP POLICY IF EXISTS "Managers can view their team requests" ON public.requests;
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;

-- Renomear a coluna papel para organizational_role e remover default temporariamente
ALTER TABLE public.people 
RENAME COLUMN papel TO organizational_role;

ALTER TABLE public.people 
ALTER COLUMN organizational_role DROP DEFAULT;

-- Atualizar dados existentes: usuários ADMIN viram is_admin=true e organizational_role=NULL
UPDATE public.people 
SET 
  is_admin = true,
  organizational_role = NULL
WHERE organizational_role = 'ADMIN';

-- Alterar coluna para usar o novo enum, permitindo NULL
ALTER TABLE public.people 
ALTER COLUMN organizational_role TYPE public.organizational_role_type 
USING CASE 
  WHEN organizational_role IN ('COLABORADOR', 'GESTOR', 'DIRETOR') 
  THEN organizational_role::public.organizational_role_type 
  ELSE NULL 
END;

-- Agora definir o novo padrão para organizational_role
ALTER TABLE public.people 
ALTER COLUMN organizational_role SET DEFAULT 'COLABORADOR';

-- Atualizar função is_current_user_admin para usar nova estrutura
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

-- Criar função para verificar papel organizacional
CREATE OR REPLACE FUNCTION public.get_current_user_organizational_role()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN (
    SELECT per.organizational_role::text
    FROM profiles p
    JOIN people per ON p.person_id = per.id
    WHERE p.user_id = auth.uid()
  );
END;
$$;

-- Recriar políticas RLS para requests (baseadas em organizational_role)
CREATE POLICY "Managers and Directors can view their team requests" 
ON public.requests 
FOR SELECT 
USING (
  -- Usuário pode ver suas próprias solicitações
  (requester_id IN (
    SELECT profiles.person_id
    FROM profiles
    WHERE profiles.user_id = auth.uid()
  ))
  OR 
  -- Gestores podem ver solicitações da sua equipe
  (requester_id IN (
    SELECT p.id
    FROM people p
    JOIN profiles prof ON prof.person_id = p.gestor_id
    WHERE prof.user_id = auth.uid()
  ))
  OR 
  -- Diretores podem ver todas as solicitações
  (EXISTS (
    SELECT 1
    FROM profiles prof
    JOIN people per ON prof.person_id = per.id
    WHERE prof.user_id = auth.uid() 
    AND per.organizational_role = 'DIRETOR'
  ))
  OR
  -- Admins podem ver todas as solicitações  
  (is_current_user_admin())
);

-- Recriar política para audit_logs (agora baseada em is_admin)
CREATE POLICY "Admins can view all audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (is_current_user_admin());

-- Comentário explicativo sobre a nova estrutura
COMMENT ON COLUMN public.people.organizational_role IS 'Papel organizacional do usuário na empresa (COLABORADOR, GESTOR, DIRETOR). NULL significa que a pessoa não tem papel organizacional definido.';
COMMENT ON COLUMN public.people.is_admin IS 'Indica se o usuário tem permissões administrativas no sistema (independente do papel organizacional).';