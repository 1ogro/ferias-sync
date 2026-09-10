-- Remove only aggregate suppression; preserve authentication, canonical weeks, source data and filters.
DO $migration$
DECLARE d text; first_pos int; last_pos int;
BEGIN
 d := pg_get_functiondef('public.get_wellbeing_report(integer,text)'::regprocedure);
 first_pos := strpos(d, '), team_sizes AS (');
 last_pos := strpos(d, '), selected AS (');
 IF first_pos=0 OR last_pos<=first_pos OR strpos(d, 'FROM safe WHERE')=0 THEN
  RAISE EXCEPTION 'Unexpected wellbeing report definition; suppression change not applied';
 END IF;
 d := left(d, first_pos-1) || $replacement$), safe AS (
   SELECT a.*, CASE WHEN response_count=0 THEN 'empty' ELSE 'available' END AS status,
    NULL::text AS protection_reason
   FROM aggregated a
  $replacement$ || substr(d, last_pos);
 EXECUTE d;
END;
$migration$;