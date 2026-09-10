DO $migration$
DECLARE definition text; start_at integer; end_at integer;
BEGIN
 SELECT pg_get_functiondef('public.get_wellbeing_report(integer,text)'::regprocedure) INTO definition;
 start_at:=strpos(definition,' ), primary_hidden AS (');
 end_at:=strpos(definition,' ), selected AS (');
 IF start_at=0 OR end_at<=start_at THEN RAISE EXCEPTION 'Unexpected wellbeing report definition'; END IF;
 definition:=substring(definition FROM 1 FOR start_at-1) || $replacement$ ), team_sizes AS (
  SELECT team,wk,count(DISTINCT respondent_id) AS people,
   count(DISTINCT respondent_id) FILTER (WHERE kind='checkin') AS ci,
   count(DISTINCT respondent_id) FILTER (WHERE kind='checkout') AS co
  FROM notes GROUP BY team,wk
 ), residual_sizes AS (
  SELECT n.wk,count(DISTINCT n.respondent_id) FILTER (WHERE n.kind='checkin') AS ci,
   count(DISTINCT n.respondent_id) FILTER (WHERE n.kind='checkout') AS co
  FROM notes n JOIN team_sizes t USING(team,wk) WHERE t.people<3 GROUP BY n.wk
 ), blocked_notes AS (
  -- Disjoint weekly blocks are independent of the requested window and team filter.
  -- Publish only unions of complete blocks with at least three distinct people.
  -- Small kinds share a block with their counterpart; small teams share a residual block.
  SELECT n.*, jsonb_build_array(n.wk,
   CASE WHEN t.people<3 THEN 'residual' ELSE 'team' END,
   CASE WHEN t.people<3 THEN NULL ELSE n.team END,
   CASE WHEN t.people<3 THEN
    CASE WHEN r.ci BETWEEN 1 AND 2 OR r.co BETWEEN 1 AND 2 THEN 'both' ELSE n.kind END
   ELSE CASE WHEN t.ci BETWEEN 1 AND 2 OR t.co BETWEEN 1 AND 2 THEN 'both' ELSE n.kind END END
  ) AS block_id
  FROM notes n JOIN team_sizes t USING(team,wk) LEFT JOIN residual_sizes r USING(wk)
 ), blocks AS (
  SELECT block_id,count(*) AS note_count,count(DISTINCT respondent_id) AS people
  FROM blocked_notes GROUP BY block_id
 ), assessed AS (
  SELECT a.*, CASE WHEN a.response_count=0 THEN NULL
   WHEN a.respondent_count<3 THEN 'insufficient_participants'
   WHEN EXISTS (
    SELECT 1 FROM blocked_notes n JOIN blocks b USING(block_id)
    WHERE (a.wk IS NULL OR n.wk=a.wk) AND (a.scope='total' OR n.team=a.team)
     AND (a.kind='both' OR n.kind=a.kind)
    GROUP BY b.block_id,b.note_count,b.people
    HAVING b.people<3 OR count(*)<>b.note_count
   ) THEN 'complementary_suppression' ELSE NULL END AS protection_reason
  FROM aggregated a
 ), safe AS (
  SELECT a.*,CASE WHEN response_count=0 THEN 'empty'
   WHEN protection_reason IS NOT NULL THEN 'protected' ELSE 'available' END AS status
  FROM assessed a
$replacement$ || substring(definition FROM end_at);
 definition:=replace(definition,'response_count,respondent_count,recipients_count,responded_deliveries,status','response_count,respondent_count,recipients_count,responded_deliveries,status,protection_reason');
 IF strpos(definition,'responded_deliveries,status,protection_reason')=0 THEN RAISE EXCEPTION 'Protection reason missing'; END IF;
 EXECUTE definition;
END;
$migration$;
REVOKE ALL ON FUNCTION public.get_wellbeing_report(integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_wellbeing_report(integer,text) TO authenticated,service_role;