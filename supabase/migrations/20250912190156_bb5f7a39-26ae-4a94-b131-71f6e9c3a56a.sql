-- Fix the get_vacation_summary function to work correctly for directors and admins
CREATE OR REPLACE FUNCTION public.get_vacation_summary(p_year integer DEFAULT NULL::integer)
 RETURNS TABLE(total_people integer, without_contract integer, accumulated_vacations integer, average_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_year integer;
  current_user_person_id text;
  user_role text;
  is_admin boolean;
BEGIN
  -- Default to current year if not specified
  target_year := COALESCE(p_year, EXTRACT(year FROM now())::integer);
  
  -- Get current user's person_id and role
  SELECT p.person_id, per.papel, per.is_admin
  INTO current_user_person_id, user_role, is_admin
  FROM profiles p
  JOIN people per ON p.person_id = per.id
  WHERE p.user_id = auth.uid();
  
  -- Check if user is admin or director
  IF NOT (is_admin = true OR user_role IN ('DIRETOR', 'ADMIN')) THEN
    RAISE EXCEPTION 'Access denied: Only admins and directors can view vacation summary';
  END IF;

  RETURN QUERY
  WITH vacation_data AS (
    SELECT 
      p.id,
      p.nome,
      p.data_contrato,
      -- Calculate balance directly without using the problematic recalculate function
      CASE 
        WHEN vb.id IS NOT NULL THEN vb.balance_days
        WHEN p.data_contrato IS NULL THEN 0
        ELSE GREATEST(0, 
          -- Calculate years worked
          (target_year - EXTRACT(year FROM p.data_contrato)::integer) * 30 - 
          -- Subtract used vacation days
          COALESCE((
            SELECT SUM(fim - inicio + 1)
            FROM requests r
            WHERE r.requester_id = p.id
            AND r.tipo = 'FERIAS'
            AND (r.status = 'REALIZADO' OR (r.status = 'APROVADO_FINAL' AND r.fim < now()::date))
            AND r.inicio IS NOT NULL AND r.fim IS NOT NULL
          ), 0)
        )
      END as balance_days
    FROM people p
    LEFT JOIN vacation_balances vb ON vb.person_id = p.id AND vb.year = target_year
    WHERE p.ativo = true
  )
  SELECT 
    COUNT(*)::integer as total_people,
    COUNT(CASE WHEN data_contrato IS NULL THEN 1 END)::integer as without_contract,
    COUNT(CASE WHEN balance_days > 30 THEN 1 END)::integer as accumulated_vacations,
    COALESCE(ROUND(AVG(CASE WHEN balance_days > 0 THEN balance_days END), 0), 0)::numeric as average_balance
  FROM vacation_data;
END;
$function$