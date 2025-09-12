-- Create function to get vacation summary efficiently
CREATE OR REPLACE FUNCTION public.get_vacation_summary(p_year integer DEFAULT NULL)
RETURNS TABLE(
  total_people integer,
  without_contract integer,
  accumulated_vacations integer,
  average_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  target_year integer;
BEGIN
  -- Default to current year if not specified
  target_year := COALESCE(p_year, EXTRACT(year FROM now())::integer);
  
  -- Check if user is admin or director
  IF NOT (
    EXISTS (
      SELECT 1 
      FROM profiles p
      JOIN people per ON p.person_id = per.id
      WHERE p.user_id = auth.uid() 
      AND (per.is_admin = true OR per.papel IN ('DIRETOR', 'ADMIN'))
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: Only admins and directors can view vacation summary';
  END IF;

  RETURN QUERY
  WITH vacation_data AS (
    SELECT 
      p.id,
      p.nome,
      p.data_contrato,
      CASE 
        WHEN vb.id IS NOT NULL THEN vb.balance_days
        ELSE (
          SELECT balance_days 
          FROM recalculate_vacation_balance(p.id, target_year)
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
    COALESCE(ROUND(AVG(balance_days), 0), 0)::numeric as average_balance
  FROM vacation_data;
END;
$$;