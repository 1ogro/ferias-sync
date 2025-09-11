-- Create security definer function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM profiles p
    JOIN people per ON p.person_id = per.id
    WHERE p.user_id = auth.uid() 
    AND per.papel = 'ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Drop existing policies for people table
DROP POLICY IF EXISTS "Users can view all people" ON public.people;
DROP POLICY IF EXISTS "read_people" ON public.people;

-- Create more restrictive RLS policies for people table
CREATE POLICY "Everyone can view people" 
ON public.people 
FOR SELECT 
USING (true);

CREATE POLICY "Only admins can insert people" 
ON public.people 
FOR INSERT 
WITH CHECK (public.is_current_user_admin());

CREATE POLICY "Only admins can update people" 
ON public.people 
FOR UPDATE 
USING (public.is_current_user_admin());

CREATE POLICY "Only admins can delete people" 
ON public.people 
FOR DELETE 
USING (public.is_current_user_admin());

-- Create audit function for people table changes
CREATE OR REPLACE FUNCTION public.audit_people_changes()
RETURNS TRIGGER AS $$
DECLARE
  actor_person_id TEXT;
BEGIN
  -- Get the person_id of the current user
  SELECT person_id INTO actor_person_id
  FROM profiles
  WHERE user_id = auth.uid();

  IF TG_OP = 'DELETE' then
    INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
    VALUES ('people', OLD.id, 'DELETE', actor_person_id, row_to_json(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' then
    INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
    VALUES ('people', NEW.id, 'UPDATE', actor_person_id, 
            json_build_object('old', row_to_json(OLD), 'new', row_to_json(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' then
    INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
    VALUES ('people', NEW.id, 'INSERT', actor_person_id, row_to_json(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for audit logging
CREATE TRIGGER people_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.audit_people_changes();