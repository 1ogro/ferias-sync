DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.get_wellbeing_report(integer,text)'::regprocedure) INTO definition;
 definition:=replace(definition,'hidden_people AS (
  SELECT count(DISTINCT n.respondent_id) AS n FROM notes n JOIN primary_hidden h ON h.team=n.team
 ), extra_hidden AS (
  SELECT a.team FROM aggregated a WHERE a.scope=''team'' AND a.level=''period'' AND a.kind=''both''
   AND a.respondent_count>=3 AND NOT EXISTS (SELECT 1 FROM primary_hidden h WHERE h.team=a.team)
   AND (SELECT n FROM hidden_people) BETWEEN 1 AND 2
  ORDER BY a.respondent_count,a.team LIMIT 1
 )','hidden_people AS (
  SELECT c.level,c.wk,c.kind,count(DISTINCT n.respondent_id) AS n
  FROM cells c JOIN notes n ON (c.wk IS NULL OR n.wk=c.wk) AND (c.kind=''both'' OR n.kind=c.kind)
  JOIN primary_hidden h ON h.team=n.team WHERE c.scope=''total'' GROUP BY c.level,c.wk,c.kind
 ), extra_hidden AS (
  SELECT DISTINCT extra.team FROM hidden_people h CROSS JOIN LATERAL (
   SELECT a.team FROM aggregated a WHERE a.scope=''team'' AND a.level=h.level AND a.wk IS NOT DISTINCT FROM h.wk AND a.kind=h.kind
    AND a.respondent_count>=3 AND NOT EXISTS(SELECT 1 FROM primary_hidden ph WHERE ph.team=a.team)
   ORDER BY a.respondent_count,a.team LIMIT 1
  ) extra WHERE h.n BETWEEN 1 AND 2
 )');
 IF position('SELECT DISTINCT extra.team' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected report definition'; END IF;
 EXECUTE definition;
END;
$migration$;