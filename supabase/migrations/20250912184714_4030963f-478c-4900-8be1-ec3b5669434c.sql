-- Create RPC function to allow users to update their own contract data
CREATE OR REPLACE FUNCTION public.set_contract_data_for_current_user(
  p_date date, 
  p_model text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_person_id text;
BEGIN
  -- Get the person_id of the current user
  SELECT person_id INTO user_person_id
  FROM profiles
  WHERE user_id = auth.uid();
  
  IF user_person_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;
  
  -- Update the contract data for this person
  UPDATE people 
  SET 
    data_contrato = p_date,
    modelo_contrato = p_model,
    updated_at = now()
  WHERE id = user_person_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found';
  END IF;
END;
$$;