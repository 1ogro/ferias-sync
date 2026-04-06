
-- 1. Sync existing is_admin = true users into user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT pr.user_id, 'admin'::app_role
FROM public.people p
JOIN public.profiles pr ON pr.person_id = p.id
WHERE p.is_admin = true
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = pr.user_id AND ur.role = 'admin'
  );

-- 2. Create trigger function to keep user_roles in sync with is_admin
CREATE OR REPLACE FUNCTION public.sync_admin_role_on_people_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  -- Only act when is_admin actually changed
  IF OLD.is_admin IS NOT DISTINCT FROM NEW.is_admin THEN
    RETURN NEW;
  END IF;

  -- Find the auth user linked to this person
  SELECT user_id INTO target_user_id
  FROM profiles
  WHERE person_id = NEW.id;

  -- If no profile linked, nothing to sync
  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin = true THEN
    -- Add admin role if not present
    INSERT INTO user_roles (user_id, role)
    VALUES (target_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- Remove admin role
    DELETE FROM user_roles
    WHERE user_id = target_user_id AND role = 'admin';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Attach the trigger to the people table
CREATE TRIGGER trg_sync_admin_role
AFTER UPDATE ON public.people
FOR EACH ROW
EXECUTE FUNCTION public.sync_admin_role_on_people_change();
