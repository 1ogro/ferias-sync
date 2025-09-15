-- Create RPC function to allow users to update their own profile data
CREATE OR REPLACE FUNCTION public.update_profile_for_current_user(
  p_nome text,
  p_email text,
  p_data_nascimento date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  user_person_id text;
  old_data jsonb;
  new_data jsonb;
BEGIN
  -- Get the person_id of the current user
  SELECT person_id INTO user_person_id
  FROM profiles
  WHERE user_id = auth.uid();
  
  IF user_person_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;
  
  -- Get old data for audit trail
  SELECT to_jsonb(p.*) INTO old_data
  FROM people p
  WHERE id = user_person_id;
  
  -- Update the profile data for this person (only basic fields)
  UPDATE people 
  SET 
    nome = p_nome,
    email = p_email,
    data_nascimento = p_data_nascimento,
    updated_at = now()
  WHERE id = user_person_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found';
  END IF;
  
  -- Get new data for audit trail
  SELECT to_jsonb(p.*) INTO new_data
  FROM people p
  WHERE id = user_person_id;
  
  -- Insert audit log
  INSERT INTO audit_logs (entidade, entidade_id, acao, actor_id, payload)
  VALUES (
    'people', 
    user_person_id, 
    'UPDATE_PROFILE', 
    user_person_id, 
    json_build_object('old', old_data, 'new', new_data)
  );
END;
$function$;