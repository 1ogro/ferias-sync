DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.get_wellbeing_report(integer,text)'::regprocedure) INTO definition;
 definition:=replace(definition,'total_protection AS (
  SELECT exists(SELECT 1 FROM aggregated WHERE scope=''total'' AND respondent_count BETWEEN 1 AND 2) AS protect
 )','total_hidden_weeks AS (
  SELECT DISTINCT wk FROM aggregated WHERE scope=''total'' AND level=''week'' AND respondent_count BETWEEN 1 AND 2
 ), extra_hidden_week AS (
  SELECT a.wk FROM aggregated a WHERE a.scope=''total'' AND a.level=''week'' AND a.kind=''both'' AND a.respondent_count>=3
   AND NOT EXISTS (SELECT 1 FROM total_hidden_weeks h WHERE h.wk=a.wk)
   AND EXISTS (SELECT 1 FROM total_hidden_weeks) ORDER BY a.respondent_count,a.wk LIMIT 1
 ), total_protection AS (
  SELECT exists(SELECT 1 FROM aggregated WHERE scope=''total'' AND level=''period'' AND respondent_count BETWEEN 1 AND 2) AS protect
 )');
 definition:=replace(definition,'OR (a.scope=''total'' AND (SELECT protect FROM total_protection))','OR (a.scope=''total'' AND ((SELECT protect FROM total_protection) OR a.wk IN (SELECT wk FROM total_hidden_weeks UNION SELECT wk FROM extra_hidden_week)))');
 IF position('total_hidden_weeks AS' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected report definition'; END IF;
 EXECUTE definition;
 SELECT pg_get_functiondef('public.get_pulse_weekly_trend(uuid,integer,text,uuid)'::regprocedure) INTO definition;
 IF position('date_trunc(''week'', resp.submitted_at)::date' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected weekly trend definition'; END IF;
 definition:=replace(definition,'date_trunc(''week'', resp.submitted_at)::date','date_trunc(''week'', resp.submitted_at AT TIME ZONE ''America/Sao_Paulo'')::date');
 definition:=replace(definition,'date_trunc(''week'', now())::date','date_trunc(''week'', now() AT TIME ZONE ''America/Sao_Paulo'')::date');
 definition:=replace(definition,'AND resp.submitted_at >= (date_trunc(''week'', now()) - ((v_weeks - 1) * INTERVAL ''7 days''))','AND resp.submitted_at >= ((date_trunc(''week'', now() AT TIME ZONE ''America/Sao_Paulo'') - ((v_weeks - 1) * INTERVAL ''7 days'')) AT TIME ZONE ''America/Sao_Paulo'') AND resp.submitted_at <= now()');
 EXECUTE definition;
END;
$migration$;