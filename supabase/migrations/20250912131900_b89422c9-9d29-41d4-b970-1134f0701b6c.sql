-- Fix critical security vulnerability: Remove overly permissive people table access
-- and implement proper row-level security policies

-- Drop the dangerous "Everyone can view people" policy
DROP POLICY IF EXISTS "Everyone can view people" ON public.people;

-- Policy 1: Users can view their own data
CREATE POLICY "Users can view their own data" 
ON public.people 
FOR SELECT 
USING (
  id IN (
    SELECT person_id 
    FROM profiles 
    WHERE user_id = auth.uid()
  )
);

-- Policy 2: Managers can view their direct reports
CREATE POLICY "Managers can view direct reports" 
ON public.people 
FOR SELECT 
USING (
  gestor_id IN (
    SELECT person_id 
    FROM profiles 
    WHERE user_id = auth.uid()
  )
);

-- Policy 3: Admins can view all data (keep existing admin access)
CREATE POLICY "Admins can view all people" 
ON public.people 
FOR SELECT 
USING (is_current_user_admin());