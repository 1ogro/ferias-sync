CREATE OR REPLACE FUNCTION public.set_contract_data_for_current_user(p_date date, p_model text, p_dia_pagamento integer DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_person_id text;
BEGIN
  SELECT person_id INTO user_person_id
  FROM profiles
  WHERE user_id = auth.uid();
  
  IF user_person_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;
  
  UPDATE people 
  SET 
    data_contrato = p_date,
    modelo_contrato = p_model,
    dia_pagamento = CASE WHEN p_model = 'PJ' THEN p_dia_pagamento ELSE NULL END,
    updated_at = now()
  WHERE id = user_person_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person record not found';
  END IF;
END;
$function$;